import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { UserInputHandler } from "../../types.js";
import { ASK_USER_TOOL_DEFINITION, type AskUserToolParams, normalizeAskUserInput } from "../../../tools/ask-user.js";
import { toPiToolParameters } from "./schema.js";

export const registerPiAskUserTool = (
  pi: Pick<ExtensionAPI, "registerTool">,
  taskId: string,
  requestUserInput: UserInputHandler,
) => {
  pi.registerTool({
    ...ASK_USER_TOOL_DEFINITION,
    parameters: toPiToolParameters(ASK_USER_TOOL_DEFINITION.parameters),
    execute: async (_toolCallId, params) => {
      const rawParams = params as AskUserToolParams;
      const input = normalizeAskUserInput(rawParams.input);
      const answer = await requestUserInput({
        taskId,
        question: rawParams.question,
        context: rawParams.context,
        input,
      });

      return {
        content: [{ type: "text", text: answer }],
        details: {
          question: rawParams.question,
          context: rawParams.context ?? null,
          input: input ?? null,
          answer,
        },
      };
    },
  });
};
