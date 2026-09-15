import type { ChildProcessWithoutNullStreams } from "node:child_process";

export interface ProcessStopOptions {
  stopTimeoutMs: number;
  shutdownGraceMs: number;
  outputDrainTimeoutMs: number;
}

export interface ProcessExit {
  confirmed: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  drainTimedOut: boolean;
}

/** Process exit and pipe closure are separate facts. kill() is only a request. */
export class ProcessLifecycle {
  readonly finished: Promise<ProcessExit>;
  hasExited = false;
  private settled = false;
  private stopping = false;
  private code: number | null = null;
  private signal: NodeJS.Signals | null = null;
  private resolveFinished!: (value: ProcessExit) => void;
  private deadline?: NodeJS.Timeout;
  private escalation?: NodeJS.Timeout;
  private drain?: NodeJS.Timeout;

  constructor(
    readonly child: ChildProcessWithoutNullStreams,
    private readonly config: ProcessStopOptions,
  ) {
    this.finished = new Promise((resolve) => {
      this.resolveFinished = resolve;
    });
    child.once("exit", (code, signal) => {
      this.hasExited = true;
      this.code = code;
      this.signal = signal;
      clearTimeout(this.deadline);
      clearTimeout(this.escalation);
      if (!this.settled) {
        this.drain = setTimeout(() => {
          this.destroyPipes();
          this.finish(true);
        }, config.outputDrainTimeoutMs);
      }
    });
    child.once("close", (code, signal) => {
      this.hasExited = true;
      this.code = code;
      this.signal = signal;
      this.finish(false);
    });
    child.on("error", () => {
      // A spawn failure has no live child. A kill error with a PID does NOT establish exit.
      if (child.pid === undefined) {
        this.hasExited = true;
        this.destroyPipes();
        this.finish(false);
      }
    });
  }

  stop(graceful?: object): Promise<ProcessExit> {
    if (this.settled) return this.finished;
    if (this.hasExited) return this.finished;
    if (!this.stopping) {
      this.stopping = true;
      this.deadline = setTimeout(() => {
        // Unknown exit is surfaced to the host; never release the session or delete its files.
        this.destroyPipes();
        this.child.unref();
        this.finish(false);
      }, this.config.stopTimeoutMs);
      if (
        graceful &&
        !this.child.stdin.destroyed &&
        !this.child.stdin.writableEnded
      ) {
        this.child.stdin.write(`${JSON.stringify(graceful)}\n`, (error) => {
          if (error) this.force();
        });
        this.escalation = setTimeout(
          () => this.force(),
          Math.min(this.config.shutdownGraceMs, this.config.stopTimeoutMs / 2),
        );
      } else this.force();
    } else if (!graceful) this.force();
    return this.finished;
  }

  private force() {
    if (this.hasExited || this.settled) return;
    try {
      this.child.kill("SIGKILL");
    } catch {
      /* The deadline handles unconfirmed termination. */
    }
  }

  private destroyPipes() {
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
  }

  private finish(drainTimedOut: boolean) {
    if (this.settled) return;
    this.settled = true;
    clearTimeout(this.deadline);
    clearTimeout(this.escalation);
    clearTimeout(this.drain);
    this.resolveFinished({
      confirmed: this.hasExited,
      code: this.code,
      signal: this.signal,
      drainTimedOut,
    });
  }
}
