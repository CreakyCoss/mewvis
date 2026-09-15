import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { RuntimeConfig } from "../../../config/runtime.js";

type DiagnosticEvent =
  | "worker_spawn"
  | "worker_ready"
  | "worker_stop"
  | "worker_exit"
  | "worker_unhealthy"
  | "heartbeat_missed"
  | "recovery_scheduled"
  | "recovery_exhausted"
  | "task_state"
  | "rpc_start"
  | "rpc_exit";
interface Fields {
  workerId?: string;
  taskId?: string;
  sessionKey?: string;
  pid?: number;
  state?: string;
  reason?: string;
  method?: string;
  code?: number | null;
  signal?: string | null;
  attempt?: number;
  durationMs?: number;
  stderrBytes?: number;
  confirmed?: boolean;
  drainTimedOut?: boolean;
}

/** Best-effort host diagnostics. Never serializes arbitrary error objects, commands or stderr. */
export class RuntimeDiagnostics {
  readonly path: string;
  private readonly queue: string[] = [];
  private queuedBytes = 0;
  private fileBytes = 0;
  private draining?: Promise<void>;
  private stopped = false;
  private failed = false;
  private dropped = 0;
  private readonly salt = randomUUID();
  private initialization?: Promise<void>;

  constructor(private readonly config: RuntimeConfig) {
    this.path = join(
      config.runtimeDataDir ?? config.dataDir,
      "agent-runtime.log",
    );
  }

  record(event: DiagnosticEvent, fields: Fields = {}) {
    if (this.stopped || this.failed) {
      this.dropped++;
      return;
    }
    const hash = (value: string) =>
      createHash("sha256")
        .update(this.salt)
        .update(value)
        .digest("hex")
        .slice(0, 20);
    const safe: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      event,
    };
    // Explicit field selection rather than a redact-after-serialization denylist.
    if (fields.taskId) safe.taskRef = hash(fields.taskId);
    if (fields.sessionKey) safe.sessionRef = hash(fields.sessionKey);
    for (const key of [
      "workerId",
      "state",
      "reason",
      "method",
      "signal",
    ] as const) {
      const value = fields[key];
      if (typeof value === "string" && /^[a-zA-Z0-9_/-]{1,80}$/.test(value))
        safe[key] = value;
    }
    for (const key of [
      "pid",
      "code",
      "attempt",
      "durationMs",
      "stderrBytes",
    ] as const) {
      const value = fields[key];
      if (typeof value === "number" && Number.isFinite(value))
        safe[key] = Math.round(value);
    }
    for (const key of ["confirmed", "drainTimedOut"] as const) {
      if (typeof fields[key] === "boolean") safe[key] = fields[key];
    }
    const line = `${JSON.stringify(safe)}\n`;
    const bytes = Buffer.byteLength(line);
    if (
      bytes > this.config.diagnosticMaxBytes ||
      this.queuedBytes + bytes > this.config.diagnosticQueueBytes
    ) {
      this.dropped++;
      return;
    }
    this.queue.push(line);
    this.queuedBytes += bytes;
    this.draining ??= this.drain();
  }

  status() {
    return {
      path: this.path,
      failed: this.failed,
      dropped: this.dropped,
      queuedBytes: this.queuedBytes,
    };
  }

  private async initialize() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    this.fileBytes =
      (
        await stat(this.path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        })
      )?.size ?? 0;
  }

  private async drain() {
    try {
      await (this.initialization ??= this.initialize());
      while (this.queue.length) {
        const line = this.queue[0];
        const bytes = Buffer.byteLength(line);
        if (this.fileBytes + bytes > this.config.diagnosticMaxBytes) {
          await rm(`${this.path}.2`, { force: true });
          await rename(`${this.path}.1`, `${this.path}.2`).catch(
            (error: NodeJS.ErrnoException) => {
              if (error.code !== "ENOENT") throw error;
            },
          );
          await rename(this.path, `${this.path}.1`).catch(
            (error: NodeJS.ErrnoException) => {
              if (error.code !== "ENOENT") throw error;
            },
          );
          this.fileBytes = 0;
        }
        await appendFile(this.path, line, { mode: 0o600 });
        this.fileBytes += bytes;
        this.queue.shift();
        this.queuedBytes -= bytes;
      }
    } catch {
      this.failed = true;
      this.dropped += this.queue.length;
      this.queue.length = 0;
      this.queuedBytes = 0;
    } finally {
      this.draining = undefined;
    }
  }

  async close() {
    this.stopped = true;
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.draining,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, this.config.diagnosticFlushTimeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
