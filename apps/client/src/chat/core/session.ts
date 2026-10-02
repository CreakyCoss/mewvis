import {
  AgentClientTransportEventType,
  type AgentClientAgentEvent,
  type AgentClientChatMessageEvent,
} from "@/agent-client/contracts";
import { AgentRuntimeEventType as E, agentRuntimeEvents } from "@/agent-client/wire";
import type {
  ChatRecord,
  ChatSession,
  ChatSnapshot,
  MessageInput,
  OperationResult,
  SendResult,
  ChatAssistantMessage,
} from "@mewvis/chat-contracts";
import { defaultConfig, errorText, type ChatSessionOptions } from "./contracts";
import { applyChatMessageEvent, failChatMessage } from "./reducer";
import { createSaveQueue } from "./save-queue";

const ok = { ok: true } as const;
const immutable = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
};
type Turn = {
  taskId: string;
  messageId: string;
  controller: AbortController;
  resolve: (result: SendResult) => void;
  dispatch?: Promise<void>;
  stopping?: Promise<OperationResult>;
  resuming?: Promise<OperationResult>;
  cancelled: boolean;
  recorded: boolean;
  stderr: string;
  events: { messageId: string; event: AgentClientChatMessageEvent }[];
  subtasks: Map<string, { messageId: string; finished: boolean }>;
  timer?: ReturnType<typeof setTimeout>;
};

export async function createChatSession(options: ChatSessionOptions): Promise<ChatSession> {
  const identity = immutable({ ...options.identity });
  const listeners = new Set<() => void>();
  let state = immutable<ChatSnapshot>({
    identity,
    phase: "initializing",
    initialized: false,
    title: "",
    messages: [],
    config: defaultConfig({}, options.config),
    resources: {},
    activeTaskId: null,
    pendingQuestion: null,
    pendingApproval: null,
    answering: false,
    error: "",
    initializationError: "",
    saveError: "",
    dirty: false,
  });
  let active: Turn | undefined;
  let unsubscribe: (() => void) | undefined;
  let initialization: Promise<void> | undefined;
  let closing: Promise<OperationResult> | undefined;
  let generation = 0;
  let resourceGeneration = 0;
  let seed = { ...options.config };
  const requests = new Map<string, Promise<SendResult>>();
  const update = (patch: Partial<ChatSnapshot>) => {
    state = immutable({ ...state, ...patch });
    for (const listener of listeners) listener();
  };
  const saves = createSaveQueue<ChatRecord>(options.storage.save.bind(options.storage), (dirty, saveError) =>
    update({ dirty, saveError }),
  );
  const mark = () => {
    if (state.initialized) saves.mark({ title: state.title, messages: state.messages, config: state.config });
  };
  const changeMessage = (
    turn: Turn,
    change: (message: ChatAssistantMessage) => ChatAssistantMessage,
    messageId = turn.messageId,
  ) => {
    if (active !== turn) return;
    update({
      messages: state.messages.map((message) =>
        message.id === messageId && message.role === "assistant" ? change(message) : message,
      ),
    });
  };
  const flushEvents = (turn = active) => {
    if (!turn) return;
    clearTimeout(turn.timer);
    turn.timer = undefined;
    const events = turn.events;
    turn.events = [];
    if (active === turn && events.length) {
      const grouped = new Map<string, AgentClientChatMessageEvent[]>();
      for (const { messageId, event } of events) {
        const batch = grouped.get(messageId) ?? [];
        batch.push(event);
        grouped.set(messageId, batch);
      }
      update({
        messages: state.messages.map((message) => {
          const batch = grouped.get(message.id);
          return message.role === "assistant" && batch ? batch.reduce(applyChatMessageEvent, message) : message;
        }),
      });
      mark();
      saves.schedule("stream", options.saveDelays?.stream ?? 10_000);
      if (events.some(({ event }) => event.type === E.ThinkingEnd))
        saves.schedule("node", options.saveDelays?.node ?? 5_000);
    }
  };
  const finish = (turn: Turn, error?: string, abortAcknowledged = false) => {
    if (active !== turn) return;
    flushEvents(turn);
    for (const subtask of turn.subtasks.values()) {
      if (subtask.finished) continue;
      subtask.finished = true;
      changeMessage(turn, (message) => failChatMessage(message, error ?? "子任务未正常结束"), subtask.messageId);
    }
    if (error) changeMessage(turn, (message) => failChatMessage(message, error));
    else
      changeMessage(turn, (message) =>
        applyChatMessageEvent(message, agentRuntimeEvents.done({ taskId: turn.taskId, text: "" })),
      );
    // A terminal event can arrive before the abort RPC completes. Keep the turn
    // reserved so a late abort cannot race a new run in the same Pi session.
    if (turn.cancelled && turn.stopping && !abortAcknowledged) {
      update({ phase: "stopping", pendingQuestion: null, pendingApproval: null, answering: false });
      mark();
      void saves.flush();
      return;
    }
    active = undefined;
    update({
      phase: "idle",
      activeTaskId: null,
      execution: { taskId: turn.taskId, state: turn.cancelled ? "cancelled" : error ? "failed" : "completed" },
      pendingQuestion: null,
      pendingApproval: null,
      answering: false,
      error: error ?? "",
    });
    if (turn.recorded) {
      mark();
      void saves.flush();
    }
  };
  const handleEvent = (envelope: AgentClientAgentEvent) => {
    const turn = active;
    if (!turn || envelope.taskId !== turn.taskId || state.phase === "preparing") return;
    const event = envelope.event;
    if (event.type === E.SubtaskEvent) {
      if (event.taskId !== turn.taskId || (event.event.taskId && event.event.taskId !== event.subtaskId)) return;
      const child = event.event;
      if (child.type === E.Started) {
        if (turn.cancelled || turn.subtasks.has(event.subtaskId)) return;
        flushEvents(turn);
        const messageId = crypto.randomUUID();
        turn.subtasks.set(event.subtaskId, { messageId, finished: false });
        const message: ChatAssistantMessage = {
          id: messageId,
          role: "assistant",
          agentName: event.title,
          agentAvatar: event.avatar,
          parentMessageId: turn.messageId,
          createdAt: Date.now(),
          status: "loading",
          blocks: [],
        };
        // Keep the parent's final reply after its child task messages.
        const messages = [...state.messages];
        messages.splice(
          messages.findIndex((item) => item.id === turn.messageId),
          0,
          message,
        );
        update({ messages });
        mark();
        return;
      }
      const subtask = turn.subtasks.get(event.subtaskId);
      if (!subtask || subtask.finished) return;
      if (child.type === E.Done || child.type === E.Error) {
        flushEvents(turn);
        subtask.finished = true;
        changeMessage(
          turn,
          (message) =>
            child.type === E.Error ? failChatMessage(message, child.message) : applyChatMessageEvent(message, child),
          subtask.messageId,
        );
        mark();
        saves.schedule("node", options.saveDelays?.node ?? 5_000);
      } else {
        turn.events.push({ messageId: subtask.messageId, event: child });
        turn.timer ??= setTimeout(() => flushEvents(turn), 16);
      }
      return;
    }
    if ([E.TextDelta, E.ThinkingDelta, E.ThinkingEnd, E.ReplaceText, E.ToolCallDelta].includes(event.type as never)) {
      turn.events.push({ messageId: turn.messageId, event: event as AgentClientChatMessageEvent });
      turn.timer ??= setTimeout(() => flushEvents(turn), 16);
      return;
    }
    flushEvents(turn);
    if (event.type === E.Started) {
      if (!turn.cancelled) update({ phase: "running" });
      changeMessage(turn, (message) => ({ ...message, status: "streaming" }));
    } else if (
      [E.ToolCallStart, E.ToolCallEnd, E.ToolExecutionStart, E.ToolExecutionUpdate, E.ToolExecutionEnd].includes(
        event.type as never,
      )
    ) {
      changeMessage(turn, (message) => applyChatMessageEvent(message, event as AgentClientChatMessageEvent));
      mark();
      saves.schedule(
        event.type === E.ToolExecutionEnd ? "node" : "stream",
        event.type === E.ToolExecutionEnd
          ? (options.saveDelays?.node ?? 5_000)
          : (options.saveDelays?.stream ?? 10_000),
      );
    } else if (event.type === E.ApprovalRequested && !turn.cancelled) {
      update({
        phase: "waiting",
        pendingApproval: {
          taskId: turn.taskId,
          approvalId: event.approvalId,
          executionId: event.executionId,
          summary: event.summary,
          details: event.details,
          reason: event.reason,
          expiresAt: event.expiresAt,
        },
      });
    } else if (event.type === E.ApprovalResolved && state.pendingApproval?.approvalId === event.approvalId) {
      update({
        phase: turn.cancelled ? "stopping" : state.pendingQuestion ? "waiting" : "running",
        pendingApproval: null,
      });
    } else if (event.type === E.Question && !turn.cancelled) {
      update({
        phase: "waiting",
        pendingQuestion: {
          taskId: turn.taskId,
          questionId: event.questionId,
          question: event.question,
          expiresAt: event.expiresAt,
          context: event.context,
          input: event.input,
        },
        answering: false,
      });
    } else if (event.type === E.QuestionAnswered && state.pendingQuestion?.questionId === event.questionId) {
      update({
        phase: turn.cancelled ? "stopping" : state.pendingApproval ? "waiting" : "running",
        pendingQuestion: null,
        answering: false,
      });
    } else if (event.type === E.Done) {
      changeMessage(turn, (message) => applyChatMessageEvent(message, event));
      finish(turn);
    } else if (event.type === E.Error) {
      finish(turn, turn.cancelled ? "已停止生成" : event.message);
    } else if (event.type === AgentClientTransportEventType.Stderr) {
      turn.stderr = event.message;
    } else if (event.type === AgentClientTransportEventType.Exit && !event.success) {
      finish(turn, turn.cancelled ? "已停止生成" : turn.stderr || `Agent 任务异常退出：${event.code}`);
    } else if (event.type === AgentClientTransportEventType.State) {
      const taskState = event.taskState.toLowerCase();
      if (taskState === "cancelling") {
        turn.cancelled = true;
        update({ phase: "stopping", execution: { taskId: turn.taskId, state: "cancelling" } });
      } else if (["paused", "pausing", "running"].includes(taskState) && !turn.cancelled) {
        const phase = taskState as "paused" | "pausing" | "running";
        update({ phase, execution: { taskId: turn.taskId, state: phase } });
      } else if (taskState === "done") finish(turn);
      else if (["cancelled", "canceled"].includes(taskState)) {
        turn.cancelled = true;
        finish(turn, "已停止生成");
      } else if (
        [taskState, event.workerState.toLowerCase()].some((value) => ["error", "failed", "crashed"].includes(value))
      )
        finish(turn, turn.stderr || "Agent 任务失败");
    }
  };
  const initialize = (): Promise<void> => {
    if (state.initialized || state.phase === "closed" || state.phase === "closing") return Promise.resolve();
    if (initialization) return initialization;
    const token = ++generation;
    update({ phase: "initializing", initializationError: "" });
    initialization = (async () => {
      try {
        if (!unsubscribe) {
          const detach = await options.runtime.subscribe(handleEvent);
          if (token !== generation) {
            detach();
            return;
          }
          unsubscribe = detach;
        }
        const [record, resources] = await Promise.all([options.storage.load(), options.catalog.load()]);
        if (token !== generation) return;
        seed = { ...options.config, ...record?.config };
        const messages = structuredClone(record?.messages ?? options.initialMessages ?? []).map((message) =>
          message.role === "assistant" && ["loading", "streaming"].includes(message.status ?? "")
            ? failChatMessage(message, "Agent 任务未正常结束。")
            : message,
        );
        update({
          initialized: true,
          phase: "idle",
          title: record?.title ?? "",
          messages,
          config: defaultConfig(resources, seed),
          resources,
        });
      } catch (error) {
        if (token === generation) update({ phase: "idle", initializationError: errorText(error) });
      } finally {
        initialization = undefined;
      }
    })();
    return initialization;
  };
  const reject = (reason: string): Promise<SendResult> => Promise.resolve({ status: "rejected", reason });
  const send = (input: MessageInput): Promise<SendResult> => {
    if (input.requestId && requests.has(input.requestId)) return requests.get(input.requestId)!;
    if (!state.initialized) return reject(state.initializationError || "会话尚未就绪");
    if (active || state.phase !== "idle" || closing) return reject("当前会话暂时无法发送消息");
    if (!input.text.trim()) return reject("请输入消息");
    if (!state.resources.models?.some((model) => model.value === state.config.selectedModelId))
      return reject("请选择可用的 LLM 模型");
    if (!state.resources.permissionOptions?.some((option) => option.mode === state.config.permissionMode))
      return reject("执行权限尚未加载，请刷新后重试");
    const taskId = crypto.randomUUID();
    let resolve!: Turn["resolve"];
    const result = new Promise<SendResult>((done) => {
      resolve = done;
    });
    if (input.requestId) requests.set(input.requestId, result);
    const turn: Turn = {
      taskId,
      messageId: crypto.randomUUID(),
      controller: new AbortController(),
      resolve,
      cancelled: false,
      recorded: false,
      stderr: "",
      events: [],
      subtasks: new Map(),
    };
    active = turn;
    const createdAt = Date.now();
    const submitted = structuredClone(input);
    const title = state.title || input.text.replace(/\s+/g, " ").trim().slice(0, 36);
    update({
      phase: "preparing",
      activeTaskId: taskId,
      execution: { taskId, state: "running" },
      pendingQuestion: null,
      pendingApproval: null,
      error: "",
    });
    const request = { identity, taskId, input: submitted, config: state.config };
    void (async () => {
      try {
        if (options.runtime.authorize) await options.runtime.authorize(request, turn.controller.signal);
        if (active !== turn || turn.cancelled) return;
        update({
          title,
          messages: [
            ...state.messages,
            {
              id: crypto.randomUUID(),
              role: "user",
              createdAt,
              status: "done",
              blocks: (submitted.blocks ?? [{ type: "text", content: submitted.text }]).map((block) => ({
                ...block,
                id: crypto.randomUUID(),
              })),
            },
            { id: turn.messageId, role: "assistant", createdAt: createdAt + 1, status: "loading", blocks: [] },
          ],
        });
        turn.recorded = true;
        mark();
        // Establish application history before Pi can create its session directory.
        const saved = await saves.flush();
        if (active !== turn || turn.cancelled) return;
        if (!saved.ok) throw new Error(`请求尚未发送，保存失败：${saved.error}`);
        const context = (await options.context?.prepare(request, turn.controller.signal)) ?? {};
        if (active !== turn || turn.cancelled) return;
        const prepared = await options.runtime.prepare({ ...request, context }, turn.controller.signal);
        if (active !== turn || turn.cancelled) return;
        changeMessage(turn, (message) => ({
          ...message,
          agentName: prepared.author?.name,
          agentAvatar: prepared.author?.avatar,
        }));
        update({ phase: "submitting" });
        // Register the promise before calling dispatch, including synchronous host events.
        turn.dispatch = Promise.resolve().then(() => prepared.dispatch());
        await turn.dispatch;
        if (!turn.cancelled) {
          if (active === turn && state.phase === "submitting") update({ phase: "running" });
          turn.resolve({ status: "dispatched", taskId });
        }
      } catch (error) {
        if (active === turn && !turn.cancelled) finish(turn, errorText(error));
        if (!turn.cancelled) turn.resolve({ status: "rejected", taskId, reason: errorText(error) });
      }
    })();
    return result;
  };
  const stop = (): Promise<OperationResult> => {
    const turn = active;
    if (!turn) return Promise.resolve(ok);
    if (turn.stopping) return turn.stopping;
    turn.cancelled = true;
    turn.controller.abort();
    turn.resolve({ status: "cancelled", taskId: turn.taskId });
    if (!turn.dispatch) {
      finish(turn, "已停止生成");
      return Promise.resolve(ok);
    }
    update({ phase: "stopping", execution: { taskId: turn.taskId, state: "cancelling" } });
    turn.stopping = (async () => {
      try {
        await turn.dispatch!.catch(() => undefined);
        // Abort after registration, even if completion/error arrived before the dispatch acknowledgement.
        await options.runtime.abort(turn.taskId);
        finish(turn, "已停止生成", true);
        return ok;
      } catch (error) {
        const message = errorText(error);
        if (active === turn)
          update({
            error: message,
            phase: "stopping",
            execution: { taskId: turn.taskId, state: "cancelling", cancelError: message },
          });
        return { ok: false, error: message } as const;
      } finally {
        turn.stopping = undefined;
      }
    })();
    return turn.stopping;
  };
  const flush = async (): Promise<OperationResult> => {
    flushEvents();
    const saved = await saves.flush();
    if (!saved.ok) return saved;
    try {
      await options.storage.flush?.();
      update({ saveError: "", dirty: saves.isDirty() });
      return ok;
    } catch (error) {
      update({ saveError: errorText(error), dirty: true });
      return { ok: false, error: errorText(error) };
    }
  };
  const session: ChatSession = {
    identity,
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send,
    stop,
    resume() {
      const turn = active;
      if (
        !turn ||
        turn.cancelled ||
        !["paused", "pausing"].includes(state.execution?.state ?? "") ||
        !options.runtime.resume
      )
        return Promise.resolve({ ok: false, error: "当前任务不可继续" } as const);
      if (turn.resuming) return turn.resuming;
      turn.resuming = (async () => {
        try {
          await options.runtime.resume!(turn.taskId);
          // Only host events move the state to running; never overwrite a concurrent cancel.
          return ok;
        } catch (error) {
          const message = errorText(error);
          if (active === turn) update({ error: message });
          return { ok: false, error: message } as const;
        } finally {
          turn.resuming = undefined;
        }
      })();
      return turn.resuming;
    },
    async answer({ questionId, answer }) {
      const question = state.pendingQuestion;
      const turn = active;
      if (
        !turn ||
        !question ||
        question.questionId !== questionId ||
        state.answering ||
        turn.cancelled ||
        (answer !== null && (!answer.trim() || Date.now() >= question.expiresAt))
      )
        return { ok: false, error: "问题已变化、已超时或正在提交回答" };
      update({ answering: true, error: "" });
      try {
        await options.runtime.answer(turn.taskId, questionId, answer === null ? null : answer.trim());
        if (active === turn && state.pendingQuestion?.questionId === questionId)
          update({ phase: state.pendingApproval ? "waiting" : "running", pendingQuestion: null, answering: false });
        return ok;
      } catch (error) {
        const message = errorText(error);
        if (active === turn && state.pendingQuestion?.questionId === questionId)
          update({ answering: false, error: message });
        return { ok: false, error: message };
      }
    },
    async updateConfig(patch) {
      if (!state.initialized || active || state.phase !== "idle" || closing)
        return { ok: false, error: "当前无法修改运行配置" };
      if (
        patch.permissionMode !== undefined &&
        !state.resources.permissionOptions?.some((option) => option.mode === patch.permissionMode)
      )
        return { ok: false, error: "当前会话不支持此权限模式" };
      const selectedModelId = patch.selectedModelId ?? state.config.selectedModelId;
      seed = { ...state.config, ...structuredClone(patch) };
      if (selectedModelId !== state.config.selectedModelId && patch.thinkingLevel === undefined)
        seed.thinkingLevel = undefined;
      const config = defaultConfig(state.resources, seed);
      if (JSON.stringify(config) !== JSON.stringify(state.config)) {
        update({ config });
        mark();
        void saves.flush();
      }
      return ok;
    },
    async refreshResources() {
      const token = ++resourceGeneration;
      try {
        const resources = await options.catalog.load({ refresh: true });
        if (token !== resourceGeneration || ["closing", "closed"].includes(state.phase)) return;
        const config = active ? state.config : defaultConfig(resources, seed);
        if (!active) {
          // A failed refresh must also preserve selections initially chosen by defaults.
          if (resources.errors?.models) {
            config.selectedModelId = state.config.selectedModelId;
            config.thinkingLevel = state.config.thinkingLevel;
          }
          if (resources.errors?.agents) config.selectedAgentId = state.config.selectedAgentId;
          if (resources.errors?.skillGroups) config.selectedSkillKeys = state.config.selectedSkillKeys;
          if (resources.errors?.knowledgeCollections)
            config.selectedKnowledgeCollectionIds = state.config.selectedKnowledgeCollectionIds;
        }
        update({ resources, config });
      } catch (error) {
        if (token === resourceGeneration && state.phase !== "closed") update({ error: errorText(error) });
      }
    },
    retryInitialization: initialize,
    flush,
    retrySave: flush,
    close() {
      if (state.phase === "closed") return Promise.resolve(ok);
      if (closing) return closing;
      closing = (async () => {
        const stopped = await stop();
        if (!stopped.ok) return stopped;
        ++generation;
        ++resourceGeneration;
        update({ phase: "closing" });
        const saved = await flush();
        if (!saved.ok) {
          update({ phase: "idle" });
          return saved;
        }
        try {
          await options.runtime.release();
          unsubscribe?.();
          unsubscribe = undefined;
          saves.cancelTimers();
          update({ phase: "closed" });
          listeners.clear();
          return ok;
        } catch (error) {
          update({ phase: "idle", error: errorText(error) });
          return { ok: false, error: errorText(error) } as const;
        }
      })().finally(() => {
        closing = undefined;
      });
      return closing;
    },
  };
  await initialize();
  return session;
}
