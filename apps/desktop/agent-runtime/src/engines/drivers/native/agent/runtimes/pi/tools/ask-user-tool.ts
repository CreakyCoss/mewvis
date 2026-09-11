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
        content: [
          {
            type: "text",
            text:
              answer ??
              "用户取消了本次回答，未提供信息或授权。请基于已有信息继续；无法继续时说明缺少什么，不要反复询问同一个问题。",
          },
        ],
        details: {
          question: rawParams.question,
          context: rawParams.context ?? null,
          input: input ?? null,
          answer,
          cancelled: answer === null,
        },
      };
    },
  });
};
