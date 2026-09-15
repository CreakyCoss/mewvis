import { createInterface } from "node:readline";
import type { WorkerConnection, WorkerRequest } from "../types.js";

/** Decode requests and encode replies on an already connected channel. */
export function serveRequests(
  connection: WorkerConnection,
  handler: {
    execute(method: string, input: unknown, progress: (value: unknown) => void): Promise<unknown>;
    close(): void;
    fail(error: unknown): void;
  },
) {
  const send = (value: unknown) => connection.output.write(`${JSON.stringify(value)}\n`);
  const reader = createInterface({ input: connection.input });
  for (const stream of new Set([connection.input, connection.output])) stream.on("error", handler.fail);
  reader.on("close", handler.close);
  reader.on("line", (line) => {
    void (async () => {
      const request = JSON.parse(line) as WorkerRequest;
      try {
        if (!Number.isSafeInteger(request.id) || typeof request.method !== "string")
          throw new Error("无效的执行请求。");
        const result = await handler.execute(request.method, request.input, (progress) => {
          send({ id: request.id, progress });
        });
        send({ id: request.id, result });
      } catch (error) {
        send({ id: request.id, error: error instanceof Error ? error.message : String(error) });
      }
    })().catch((error) => {
      send({ fatal: String(error) });
      handler.fail(error);
    });
  });
}
