import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createMediaTool,
  type MediaToolContext,
} from "../../../tools/media/index.js";
import { toPiToolParameters } from "./schema.js";

export function createPiMediaTool(
  context: MediaToolContext,
): Parameters<ExtensionAPI["registerTool"]>[0] | undefined {
  const tool = createMediaTool(context);
  if (!tool) return undefined;
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: toPiToolParameters(tool.parameters),
    async execute(callId, input, signal, onUpdate) {
      const value = await tool.execute(callId, input, {
        signal,
        progress: (value) =>
          onUpdate?.({
            content: [{ type: "text", text: value.message }],
            details: value,
          }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(value) }],
        details: value,
      };
    },
  };
}
