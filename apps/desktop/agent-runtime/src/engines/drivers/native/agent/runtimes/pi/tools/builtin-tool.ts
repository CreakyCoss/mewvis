import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  assertBuiltinToolImplementation,
  type BuiltinToolContext,
  type BuiltinToolDefinition,
} from "../../../../../../builtins/definition.js";
import { toPiToolParameters } from "./schema.js";

const jsonText = (value: unknown) => JSON.stringify(value, null, 2);

export const registerPiBuiltinTool = (
  pi: Pick<ExtensionAPI, "registerTool">,
  tool: BuiltinToolDefinition,
  context: BuiltinToolContext,
) => {
  const implementation = tool.createImplementation(context);
  assertBuiltinToolImplementation(tool, implementation);
  pi.registerTool({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: toPiToolParameters(tool.parameters),
    execute: async (_toolCallId, params) => {
      const value = await implementation.execute(params);
      return {
        content: [{ type: "text", text: jsonText(value) }],
        details: value,
      };
    },
  });
};
