import { createInterface, type Interface } from "node:readline";
import type { WorkerConnection } from "../types.js";

/** RPC framing and pending replies; the caller owns process and cancellation policy. */
export class RpcClient {
  private readonly reader: Interface;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve(value: any): void; reject(error: Error): void; progress?(value: any): void }
  >();
  private closed = false;

  constructor(
    private readonly connection: WorkerConnection,
    fail: (error: Error) => void,
  ) {
    this.reader = createInterface({ input: connection.input });
    for (const stream of new Set([connection.input, connection.output])) stream.on("error", fail);
    this.reader.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.fatal) return fail(new Error(message.fatal));
        const pending = this.pending.get(message.id);
        if (!pending) return;
        if (message.progress !== undefined) pending.progress?.(message.progress);
        else if (message.error) pending.reject(new Error(message.error));
        else pending.resolve(message.result);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  get pendingCount() {
    return this.pending.size;
  }

  async call<T>(method: string, input: unknown, progress?: (value: any) => void): Promise<T> {
    if (this.closed) throw new Error("执行连接已关闭。");
    const id = ++this.nextId;
    try {
      return await new Promise<T>((resolve, reject) => {
        this.pending.set(id, { resolve, reject, progress });
        this.connection.output.write(`${JSON.stringify({ id, method, input })}\n`);
      });
    } finally {
      this.pending.delete(id);
    }
  }

  close(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.reader.close();
  }
}
