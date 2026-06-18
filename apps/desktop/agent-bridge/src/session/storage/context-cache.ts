import { writeFile } from "node:fs/promises";
import type { BridgeSessionContext } from "../core/types.js";

export const writeBridgeContextCache = async (
  contextPath: string,
  context: BridgeSessionContext,
) => {
  await writeFile(
    contextPath,
    `${JSON.stringify({
      summary: context.summary,
      messages: context.messages,
      requestContexts: context.requestContexts,
      runtimeInstructions: context.runtimeInstructions,
      leafId: context.leafId,
      updatedAt: Date.now(),
    }, null, 2)}\n`,
    "utf8",
  );
};
