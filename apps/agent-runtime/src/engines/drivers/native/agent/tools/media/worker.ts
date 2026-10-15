import { serveWorker } from "../../../../../../security/execution/index.js";
import { runMediaGeneration } from "./generate.js";
import type { MediaGenerationRequest } from "./types.js";

const pending = new Set<Promise<unknown>>();
serveWorker({
  async execute(method, input, context) {
    if (method !== "generate") throw new Error("未知媒体工具执行请求");
    const operation = runMediaGeneration(
      input as MediaGenerationRequest,
      context,
    );
    pending.add(operation);
    try {
      return await operation;
    } finally {
      pending.delete(operation);
    }
  },
  async dispose() {
    await Promise.allSettled([...pending]);
  },
});
