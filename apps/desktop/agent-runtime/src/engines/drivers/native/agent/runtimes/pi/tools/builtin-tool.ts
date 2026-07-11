import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BuiltinToolContext, BuiltinToolDefinition } from "../../../../../../builtins/types.js";
import { toPiToolParameters } from "./schema.js";

const jsonText = (value: unknown) => JSON.stringify(value, null, 2);

export const registerPiBuiltinTool = (pi: ExtensionAPI, tool: BuiltinToolDefinition, context: BuiltinToolContext) => {
  const execute = tool.createExecutor(context);
  pi.registerTool({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: toPiToolParameters(tool.parameters),
    execute: async (_toolCallId, params) => {
      const value = await execute(params);
      return {
        content: [{ type: "text", text: jsonText(value) }],
        details: value,
      };
    },
  });
};
