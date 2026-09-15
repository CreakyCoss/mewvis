import { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { RuntimeConfig } from "../../../config/runtime.js";
import { EventHub } from "../../../infrastructure/events/event-hub.js";
import { readLines, spawnRuntime, writeCommand } from "./process.js";
import {
  ProcessLifecycle,
  type ProcessExit,
} from "../../../infrastructure/process/lifecycle.js";
import { RuntimeDiagnostics } from "./diagnostics.js";
import {
  RuntimeProtocol,
  type RpcRequest,
  type RuntimeMessage,
} from "./protocol.js";
import { ServiceError, type JsonObject } from "../../../shared/validation.js";

export type WorkerState =
  | "starting"
  | "idle"
  | "running"
  | "waiting_user"
  | "unhealthy"
  | "stopping"
  | "stopped"
  | "crashed"
  | "recovering";
export type TaskState =
  | "queued"
  | "starting"
  | "running"
  | "waiting_user"
  | "completing"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "done"
  | "recovering";
type StopReason = "idle" | "cancelled" | "disposed" | "unhealthy";
export interface Submission {
  taskId: string;
  sessionKey: string;
  workspacePath: string;
  sessionRootDir?: string;
  applicationId?: string;
  command: RpcRequest;
}
export interface TaskSnapshot {
  taskId: string;
  taskState: TaskState;
  workerId: string;
  sessionKey: string;
  updatedAt: number;
  pendingInput?: JsonObject;
}

const terminal = new Set<TaskState>(["done", "failed", "cancelled"]);

/** Owns stdio workers using Tauri's protocol boundary, with explicit startup and recovery lifecycles. */
export class AgentRuntimeSupervisor {
  readonly events = new EventHub();
  readonly protocol: RuntimeProtocol;
  readonly diagnostics: RuntimeDiagnostics;
  private readonly workers = new Map<string, RuntimeWorker>();
  private readonly taskIndex = new Map<string, RuntimeWorker>();
  private readonly tasks = new Map<string, TaskSnapshot>();
  private readonly applications = new Map<string, string>();
  private readonly blockedSessions = new Set<string>();
  private readonly rpcProcesses = new Map<
    ChildProcessWithoutNullStreams,
    { lifecycle: ProcessLifecycle; stop: () => void }
  >();
  private closing = false;
  private closePromise?: Promise<void>;

  constructor(readonly config: RuntimeConfig) {
    this.protocol = new RuntimeProtocol(config.protocolDir);
    this.diagnostics = new RuntimeDiagnostics(config);
  }

  private assertOpen() {
    if (this.closing)
      throw new ServiceError(503, "SERVER_STOPPING", "Server 正在停止");
  }

  private assertCapacity() {
    this.assertOpen();
    if (this.workers.size + this.rpcProcesses.size >= this.config.maxWorkers) {
      throw new ServiceError(503, "WORKER_LIMIT", "Runtime 进程数已达上限");
    }
  }

  submit(submission: Submission): { taskId: string } {
    this.assertOpen();
    this.assertSessionAvailable(
      submission.workspacePath,
      submission.sessionRootDir,
    );
    if (this.taskIndex.has(submission.taskId))
      throw new ServiceError(409, "TASK_EXISTS", "taskId 已存在");
    const worker = this.workerFor(submission);
    if (!worker.usable)
      throw new ServiceError(
        409,
        "SESSION_STOPPING",
        "会话 worker 正在停止，请稍后重试",
      );
    if (worker.queuedCount >= this.config.maxQueuedTasks)
      throw new ServiceError(429, "QUEUE_LIMIT", "会话任务队列已满");
    this.tasks.delete(submission.taskId);
    this.taskIndex.set(submission.taskId, worker);
    if (submission.applicationId)
      this.applications.set(submission.taskId, submission.applicationId);
    worker.enqueue(submission);
    return { taskId: submission.taskId };
  }

  private workerFor(submission: Submission): RuntimeWorker {
    const existing = this.workers.get(submission.sessionKey);
    if (existing) return existing;
    this.assertCapacity();
    const worker = new RuntimeWorker(this, submission);
    this.workers.set(submission.sessionKey, worker);
    return worker;
  }

  snapshot(taskId: string): TaskSnapshot | undefined {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : undefined;
  }

  status() {
    return {
      workers: [...this.workers.values()].map((worker) => ({
        workerId: worker.id,
        pid: worker.child.pid,
        sessionKey: worker.scope.sessionKey,
        workerState: worker.state,
        currentTaskId: worker.current?.taskId ?? null,
        queueDepth: worker.queue.length,
      })),
      rpcProcesses: this.rpcProcesses.size,
      diagnostics: this.diagnostics.status(),
      tasks: [...this.tasks.values()].map((task) => structuredClone(task)),
    };
  }

  state(worker: RuntimeWorker, taskId: string, taskState: TaskState) {
    this.diagnostics.record("task_state", {
      workerId: worker.id,
      taskId,
      state: taskState,
    });
    const previous = this.tasks.get(taskId);
    this.tasks.set(taskId, {
      taskId,
      taskState,
      workerId: worker.id,
      sessionKey: worker.scope.sessionKey,
      updatedAt: Date.now(),
      ...(taskState === "waiting_user" && previous?.pendingInput
        ? { pendingInput: previous.pendingInput }
        : {}),
    });
    if (terminal.has(taskState)) {
      this.taskIndex.delete(taskId);
      this.applications.delete(taskId);
      const completed = [...this.tasks.values()].filter((task) =>
        terminal.has(task.taskState),
      );
      for (const task of completed.slice(
        0,
        Math.max(0, completed.length - 512),
      ))
        this.tasks.delete(task.taskId);
    }
    this.emit(taskId, {
      type: "state",
      taskState,
      workerState: worker.state,
      workerId: worker.id,
      sessionKey: worker.scope.sessionKey,
      queueDepth: worker.queue.length,
    });
  }

  emit(taskId: string, event: JsonObject) {
    const task = this.tasks.get(taskId);
    if (
      task &&
      (event.type === "question" || event.type === "approval_requested")
    )
      task.pendingInput = structuredClone(event);
    if (
      task &&
      (event.type === "question_answered" || event.type === "approval_resolved")
    )
      delete task.pendingInput;
    this.events.publish("agent_runtime_agent_event", { taskId, event });
  }

  answer(taskId: string, command: RpcRequest) {
    this.assertOpen();
    const worker = this.taskIndex.get(taskId);
    if (!worker)
      throw new ServiceError(404, "TASK_NOT_FOUND", "任务不存在或已结束");
    if (!worker.usable || worker.current?.taskId !== taskId)
      throw new ServiceError(409, "TASK_NOT_RUNNING", "任务尚未运行或正在停止");
    worker.write(command);
  }

  abort(taskId: string) {
    this.taskIndex.get(taskId)?.abort(taskId);
  }

  abortApplication(applicationId: string) {
    for (const [taskId, owner] of this.applications)
      if (owner === applicationId) this.abort(taskId);
  }

  assertSessionAvailable(workspacePath: string, sessionRootDir?: string) {
    if (
      [...this.workers.values()].some(
        (worker) =>
          worker.quarantined &&
          worker.scope.workspacePath === workspacePath &&
          worker.scope.sessionRootDir === sessionRootDir,
      )
    ) {
      throw new ServiceError(
        503,
        "WORKER_EXIT_UNCONFIRMED",
        "无法确认会话旧进程退出，暂时隔离该会话",
      );
    }
    if (
      this.blockedSessions.has(JSON.stringify([workspacePath, sessionRootDir]))
    ) {
      throw new ServiceError(409, "SESSION_STOPPING", "会话正在释放");
    }
  }

  async disposeSession(
    workspacePath: string,
    sessionRootDir: string,
    afterStop?: () => Promise<void>,
  ) {
    this.assertOpen();
    this.assertSessionAvailable(workspacePath, sessionRootDir);
    const key = JSON.stringify([workspacePath, sessionRootDir]);
    this.blockedSessions.add(key);
    try {
      const workers = [...this.workers.values()].filter(
        (worker) =>
          worker.scope.workspacePath === workspacePath &&
          worker.scope.sessionRootDir === sessionRootDir,
      );
      const results = await Promise.allSettled(
        workers.map((worker) => worker.stop("disposed")),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      await afterStop?.();
    } finally {
      this.blockedSessions.delete(key);
    }
  }

  retire(worker: RuntimeWorker) {
    if (this.workers.get(worker.scope.sessionKey) === worker)
      this.workers.delete(worker.scope.sessionKey);
  }

  cancelRecovery(worker: RuntimeWorker) {
    clearTimeout(worker.recoveryTimer);
    worker.recoveryTimer = undefined;
    this.retire(worker);
    for (const task of worker.queue.splice(0))
      this.state(worker, task.taskId, "cancelled");
  }

  exited(worker: RuntimeWorker, outcome: ProcessExit) {
    const { code, signal, confirmed } = outcome;
    this.diagnostics.record("worker_exit", {
      workerId: worker.id,
      sessionKey: worker.scope.sessionKey,
      pid: worker.child.pid,
      code,
      signal,
      confirmed,
      drainTimedOut: outcome.drainTimedOut,
      stderrBytes: worker.stderrBytes,
      durationMs: performance.now() - worker.startedAt,
      reason: worker.stopReason,
    });
    const current = worker.current;
    worker.current = undefined;
    const cancelled =
      worker.stopReason === "cancelled" || worker.stopReason === "disposed";
    if (current) {
      if (!worker.stopReason)
        this.emit(current.taskId, {
          type: "error",
          message: `Agent worker 在任务结果前退出：${signal ?? code}`,
        });
      this.state(
        worker,
        current.taskId,
        confirmed && cancelled ? "cancelled" : "failed",
      );
      this.emit(current.taskId, { type: "exit", success: code === 0, code });
    }
    if (!confirmed) {
      // Retain a quarantine slot until a later exit is observed. Never overlap execution or permit deletion.
      worker.quarantined = true;
      worker.state = "unhealthy";
      for (const task of worker.queue.splice(0)) {
        this.emit(task.taskId, {
          type: "error",
          message: "无法确认旧 worker 已退出，停止自动恢复",
        });
        this.state(worker, task.taskId, "failed");
      }
      return;
    }
    // Never replay the active task: it may already have produced external side effects.
    if (
      this.closing ||
      worker.stopReason === "disposed" ||
      worker.stopReason === "idle" ||
      !worker.queue.length
    ) {
      this.retire(worker);
      for (const task of worker.queue.splice(0)) {
        this.state(worker, task.taskId, "cancelled");
      }
      return;
    }
    const attempt =
      worker.stopReason === "cancelled" ? 0 : worker.recoveryAttempt + 1;
    if (attempt > this.config.maxRecoveryAttempts) {
      this.diagnostics.record("recovery_exhausted", {
        workerId: worker.id,
        attempt,
      });
      this.retire(worker);
      for (const task of worker.queue.splice(0)) {
        this.emit(task.taskId, {
          type: "error",
          message: "Worker 连续恢复失败，已停止重试",
        });
        this.state(worker, task.taskId, "failed");
      }
      return;
    }
    worker.state = "recovering";
    this.diagnostics.record("recovery_scheduled", {
      workerId: worker.id,
      attempt,
    });
    for (const task of worker.queue)
      this.state(worker, task.taskId, "recovering");
    // Keep the session and queue reserved during backoff. New work cannot overtake accepted work.
    worker.recoveryTimer = setTimeout(
      () => {
        worker.recoveryTimer = undefined;
        if (
          this.closing ||
          worker.stopReason === "disposed" ||
          !worker.queue.length
        ) {
          this.cancelRecovery(worker);
          return;
        }
        this.retire(worker);
        const queued = worker.queue.splice(0);
        try {
          const replacement = this.workerFor(queued[0]);
          replacement.recoveryAttempt = attempt;
          for (const task of queued) {
            this.taskIndex.set(task.taskId, replacement);
            replacement.enqueue(task);
          }
        } catch (error) {
          for (const task of queued) {
            this.emit(task.taskId, {
              type: "error",
              message: `恢复队列失败：${String(error)}`,
            });
            this.state(worker, task.taskId, "failed");
          }
        }
      },
      Math.min(
        this.config.restartBackoffMs * 2 ** Math.max(0, attempt - 1),
        5_000,
      ),
    );
  }

  /** Tauri's call_agent_runtime_rpc uses a short-lived process and closes stdin after one request. */
  call(
    method: string,
    params: JsonObject,
    resultTypes: readonly string[],
    onEvent: (event: JsonObject) => void = () => {},
  ): Promise<JsonObject> {
    this.assertCapacity();
    const id = randomUUID();
    const command = this.protocol.command(method, params, id);
    const child = spawnRuntime(this.config);
    const lifecycle = new ProcessLifecycle(child, this.config);
    const startedAt = performance.now();
    let stderrBytes = 0;
    this.diagnostics.record("rpc_start", {
      workerId: id,
      method,
      pid: child.pid,
    });
    return new Promise((resolve, reject) => {
      let result: JsonObject | undefined;
      let failure: Error | undefined;
      const fail = (error: Error) => {
        failure ??= error;
        void lifecycle.stop();
      };
      const timer = setTimeout(
        () =>
          fail(new ServiceError(504, "RUNTIME_TIMEOUT", "Runtime 请求超时")),
        this.config.rpcTimeoutMs,
      );
      this.rpcProcesses.set(child, {
        lifecycle,
        stop: () => fail(new Error("Server 正在停止")),
      });
      child.on("error", fail);
      child.stdin.on("error", fail);
      readLines(
        child.stdout,
        this.config.maxLineBytes,
        (line) => {
          const message = this.protocol.decode(line);
          if (message.kind === "error") {
            fail(new Error(String(message.error.message)));
            return;
          }
          if (message.kind === "response") {
            if (
              message.id !== id ||
              !resultTypes.includes(String(message.value.type))
            ) {
              fail(new Error("Runtime 返回了不匹配的请求 ID 或结果类型"));
              return;
            }
            result = message.value;
          } else if (message.kind === "event") onEvent(message.value);
        },
        fail,
      );
      // Drain diagnostics without accumulating or logging model credentials.
      readLines(
        child.stderr,
        this.config.maxLineBytes,
        (line) => {
          stderrBytes += Buffer.byteLength(line);
        },
        fail,
      );
      void lifecycle.finished.then((outcome) => {
        const { code, signal, confirmed } = outcome;
        clearTimeout(timer);
        if (confirmed) this.rpcProcesses.delete(child);
        else child.once("exit", () => this.rpcProcesses.delete(child));
        this.diagnostics.record("rpc_exit", {
          workerId: id,
          method,
          pid: child.pid,
          code,
          signal,
          confirmed,
          drainTimedOut: outcome.drainTimedOut,
          stderrBytes,
          durationMs: performance.now() - startedAt,
        });
        if (!confirmed)
          reject(
            new ServiceError(
              504,
              "WORKER_EXIT_UNCONFIRMED",
              "Runtime 请求已停止等待，但无法确认子进程退出",
            ),
          );
        else if (failure) reject(failure);
        else if (code !== 0 || !result)
          reject(new Error(`Runtime 未正常返回结果：${signal ?? code}`));
        else resolve(result);
      });
      child.stdin.end(`${JSON.stringify(command)}\n`);
    });
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      const stops = [...this.workers.values()].map((worker) =>
        worker.stop("disposed"),
      );
      for (const rpc of this.rpcProcesses.values()) {
        rpc.stop();
        stops.push(
          rpc.lifecycle.finished.then((outcome) => {
            if (!outcome.confirmed)
              throw new ServiceError(
                504,
                "WORKER_EXIT_UNCONFIRMED",
                "无法确认 Runtime 子进程退出",
              );
          }),
        );
      }
      const results = await Promise.allSettled(stops);
      await this.diagnostics.close();
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    })();
    return this.closePromise;
  }
}

class RuntimeWorker {
  readonly id = randomUUID();
  readonly child: ChildProcessWithoutNullStreams;
  readonly lifecycle: ProcessLifecycle;
  readonly startedAt = performance.now();
  stderrBytes = 0;
  recoveryAttempt = 0;
  recoveryTimer?: NodeJS.Timeout;
  quarantined = false;
  readonly queue: Submission[] = [];
  state: WorkerState = "starting";
  current?: Submission;
  stopReason?: StopReason;
  private lastActivity = performance.now();
  private pendingPing?: { id: string; sentAt: number };
  private missedHeartbeats = 0;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly idleCheck: NodeJS.Timeout;
  private readonly startupTimer: NodeJS.Timeout;
  private readonly startupId = `startup-${randomUUID()}`;
  private ready = false;
  private readonly closed: Promise<void>;
  readonly scope: Pick<
    Submission,
    "sessionKey" | "workspacePath" | "sessionRootDir"
  >;

  constructor(
    private readonly supervisor: AgentRuntimeSupervisor,
    scope: Submission,
  ) {
    // Idle workers retain only identity, not the first task's model credentials or prompt.
    this.scope = {
      sessionKey: scope.sessionKey,
      workspacePath: scope.workspacePath,
      sessionRootDir: scope.sessionRootDir,
    };
    const config = supervisor.config;
    this.child = spawnRuntime(config);
    this.lifecycle = new ProcessLifecycle(this.child, config);
    supervisor.diagnostics.record("worker_spawn", {
      workerId: this.id,
      sessionKey: this.scope.sessionKey,
      pid: this.child.pid,
    });
    this.child.on("error", (error) => this.unhealthy(error, "process_error"));
    this.child.stdin.on("error", (error) => this.unhealthy(error));
    readLines(
      this.child.stdout,
      config.maxLineBytes,
      (line) => this.message(supervisor.protocol.decode(line)),
      (error) => this.unhealthy(error),
    );
    readLines(
      this.child.stderr,
      config.maxLineBytes,
      (line) => {
        this.stderrBytes += Buffer.byteLength(line);
        if (this.current)
          supervisor.emit(this.current.taskId, {
            type: "stderr",
            message: line,
          });
      },
      (error) => this.unhealthy(error),
    );
    this.child.on("exit", () => {
      if (this.quarantined) {
        supervisor.retire(this);
        return;
      }
      clearTimeout(this.startupTimer);
      clearInterval(this.heartbeat);
      clearInterval(this.idleCheck);
    });
    this.closed = this.lifecycle.finished.then((outcome) => {
      clearInterval(this.heartbeat);
      clearInterval(this.idleCheck);
      clearTimeout(this.startupTimer);
      this.state =
        outcome.code === 0 || this.stopReason ? "stopped" : "crashed";
      supervisor.exited(this, outcome);
    });
    this.heartbeat = setInterval(() => this.ping(), config.heartbeatIntervalMs);
    this.idleCheck = setInterval(() => {
      if (
        this.state === "idle" &&
        !this.current &&
        !this.queue.length &&
        performance.now() - this.lastActivity >= config.idleTimeoutMs
      ) {
        void this.stop("idle").catch(() => {}); // State, quarantine and diagnostics report stop failures.
      }
    }, config.idleCheckIntervalMs);
    this.startupTimer = setTimeout(
      () =>
        this.unhealthy(new Error("Runtime 启动握手超时"), "startup_timeout"),
      config.startupTimeoutMs,
    );
    this.write(supervisor.protocol.command("runtime/ping", {}, this.startupId));
  }

  get usable() {
    return (
      !this.lifecycle.hasExited &&
      ["starting", "idle", "running", "waiting_user"].includes(this.state)
    );
  }

  get queuedCount() {
    return this.queue.length - (!this.ready && this.queue.length ? 1 : 0);
  }

  enqueue(task: Submission) {
    if (this.current || !this.ready || this.queue.length) {
      this.queue.push(task);
      this.supervisor.state(
        this,
        task.taskId,
        !this.ready && this.queue.length === 1 ? "starting" : "queued",
      );
    } else this.launch(task);
  }

  private launch(task: Submission) {
    this.current = task;
    this.state = "running";
    this.lastActivity = performance.now();
    this.supervisor.state(this, task.taskId, "starting");
    this.write(task.command);
    if (this.usable) this.supervisor.state(this, task.taskId, "running");
  }

  write(command: RpcRequest) {
    writeCommand(this.child, command, (error) => this.unhealthy(error));
  }

  abort(taskId: string) {
    const index = this.queue.findIndex((task) => task.taskId === taskId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.supervisor.state(this, taskId, "cancelled");
    } else if (this.current?.taskId === taskId && this.usable) {
      this.supervisor.emit(taskId, {
        type: "error",
        message: "Agent 任务已取消",
      });
      void this.stop("cancelled").catch(() => {});
    }
  }

  async stop(reason: StopReason): Promise<void> {
    if (this.recoveryTimer) {
      this.stopReason = reason;
      this.state = "stopped";
      this.supervisor.cancelRecovery(this);
      return;
    }
    // A session/server disposal overrides cancellation and prevents queued work from restarting.
    if (reason === "disposed" || !this.stopReason) this.stopReason = reason;
    if (this.state !== "stopping") {
      this.state = "stopping";
      clearInterval(this.heartbeat);
      clearInterval(this.idleCheck);
      clearTimeout(this.startupTimer);
      this.supervisor.diagnostics.record("worker_stop", {
        workerId: this.id,
        reason,
      });
      if (this.current)
        this.supervisor.state(this, this.current.taskId, "cancelling");
    }
    const outcome = await this.lifecycle.stop(
      reason === "idle"
        ? this.supervisor.protocol.command(
            "runtime/shutdown",
            {},
            `idle-shutdown-${this.id}`,
          )
        : undefined,
    );
    await this.closed;
    if (!outcome.confirmed)
      throw new ServiceError(
        504,
        "WORKER_EXIT_UNCONFIRMED",
        "等待 worker 退出超时，无法确认进程已终止",
      );
  }

  private unhealthy(error: Error, reason = "protocol_or_io_error") {
    if (!this.usable) return;
    this.state = "unhealthy";
    this.stopReason = "unhealthy";
    clearTimeout(this.startupTimer);
    clearInterval(this.heartbeat);
    clearInterval(this.idleCheck);
    this.supervisor.diagnostics.record("worker_unhealthy", {
      workerId: this.id,
      reason,
    });
    if (this.current)
      this.supervisor.emit(this.current.taskId, {
        type: "error",
        message: error.message,
      });
    void this.lifecycle.stop();
  }

  private ping() {
    if (!this.usable || !this.ready) return;
    const now = performance.now();
    if (this.pendingPing) {
      if (
        now - this.pendingPing.sentAt <
        this.supervisor.config.heartbeatTimeoutMs
      )
        return;
      this.missedHeartbeats++;
      this.supervisor.diagnostics.record("heartbeat_missed", {
        workerId: this.id,
        attempt: this.missedHeartbeats,
      });
      if (this.missedHeartbeats >= this.supervisor.config.heartbeatMaxMisses) {
        this.unhealthy(
          new Error(
            `Agent worker 心跳超时，连续 ${this.missedHeartbeats} 次未响应`,
          ),
          "heartbeat_timeout",
        );
        return;
      }
    }
    this.pendingPing = { id: `heartbeat-${randomUUID()}`, sentAt: now };
    this.write(
      this.supervisor.protocol.command("runtime/ping", {}, this.pendingPing.id),
    );
  }

  private message(message: RuntimeMessage) {
    if (message.kind === "error") {
      if (message.id === this.startupId) {
        this.unhealthy(new Error("Runtime 启动握手失败"), "startup_error");
        return;
      }
      if (message.id === this.pendingPing?.id) return;
      if (message.id === `idle-shutdown-${this.id}`) {
        void this.lifecycle.stop();
        return;
      }
      if (this.current && message.id === this.current.taskId && this.usable) {
        this.supervisor.emit(this.current.taskId, {
          type: "error",
          message: String(message.error.message),
        });
        this.complete(false);
      }
      return;
    }
    const value = message.value;
    if (value.type === "pong") {
      if (
        message.kind === "response" &&
        message.id === this.startupId &&
        this.usable &&
        !this.ready
      ) {
        clearTimeout(this.startupTimer);
        this.ready = true;
        this.state = "idle";
        this.lastActivity = performance.now();
        this.supervisor.diagnostics.record("worker_ready", {
          workerId: this.id,
          durationMs: performance.now() - this.startedAt,
        });
        const next = this.queue.shift();
        if (next) this.launch(next);
        return;
      }
      if (message.kind === "response" && message.id === this.pendingPing?.id) {
        this.pendingPing = undefined;
        this.missedHeartbeats = 0;
      }
      return; // Heartbeats must not prevent idle reclamation.
    }
    if (this.stopReason || !this.current) return;
    if (message.kind === "response" && message.id !== this.current.taskId)
      return;
    if (
      typeof value.taskId === "string" &&
      value.taskId !== this.current.taskId
    )
      return;
    if (message.kind === "result" && value.rpcRequestId !== this.current.taskId)
      return;
    this.lastActivity = performance.now();
    if (value.type === "task_result") {
      this.complete(value.success === true);
      return;
    }
    if (value.type === "shutdown_ack" || value.type === "chat_result") return;
    const nextState: TaskState | undefined =
      value.type === "question" || value.type === "approval_requested"
        ? "waiting_user"
        : value.type === "done"
          ? "completing"
          : ["started", "question_answered", "approval_resolved"].includes(
                String(value.type),
              )
            ? "running"
            : undefined;
    if (nextState) {
      this.state = nextState === "waiting_user" ? "waiting_user" : "running";
      this.supervisor.state(this, this.current.taskId, nextState);
    }
    this.supervisor.emit(this.current.taskId, value);
  }

  private complete(success: boolean) {
    if (!this.current || this.stopReason) return;
    const taskId = this.current.taskId;
    this.current = undefined;
    this.state = "idle";
    this.lastActivity = performance.now();
    if (success) this.recoveryAttempt = 0;
    this.supervisor.state(this, taskId, success ? "done" : "failed");
    // Defer queue advancement until all output in this turn has been processed; an exit can follow a result.
    setImmediate(() => {
      if (!this.usable || this.current) return;
      const next = this.queue.shift();
      if (next) this.launch(next);
    });
  }
}
