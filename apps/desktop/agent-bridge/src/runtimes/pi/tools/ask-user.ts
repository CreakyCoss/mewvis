import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AskUser } from "../../types.js";
import {
  ASK_USER_TOOL_DEFINITION,
  type AskUserCall,
  type AskUserToolParams,
  normalizeAskUserInput,
} from "../../../tools/ask-user.js";
import type { AskUserInput } from "../../../tools/types.js";
import { findXmlElement, parseXmlFragment } from "../../../utils/xml.js";
import { toPiToolParameters } from "./schema.js";

export const parsePiAskUserFunctionCall = (text: string): AskUserCall | null => {
  if (!text.includes("<invoke") || !text.includes(ASK_USER_TOOL_DEFINITION.name)) {
    return null;
  }

  const invoke = findXmlElement(
    parseXmlFragment(text),
    (element) => element.name === "invoke" && element.attributes.name === ASK_USER_TOOL_DEFINITION.name,
  );
  if (!invoke) {
    return null;
  }

  const parameter = (name: string) =>
    invoke.children.find((element) => element.name === "parameter" && element.attributes.name === name)?.text.trim();
  const question = parameter("question");
  if (!question) {
    return null;
  }

  const inputText = parameter("input");
  let parsedInput: AskUserInput | undefined;
  if (inputText) {
    try {
      parsedInput = normalizeAskUserInput(JSON.parse(inputText));
    } catch {
      parsedInput = undefined;
    }
  }

  return {
    question,
    context: parameter("context") ?? null,
    input: parsedInput,
  };
};

export const registerPiAskUserTool = (
  pi: ExtensionAPI,
  taskId: string,
  askUser: AskUser,
) => {
  pi.registerTool({
    name: ASK_USER_TOOL_DEFINITION.name,
    label: ASK_USER_TOOL_DEFINITION.label,
    description: ASK_USER_TOOL_DEFINITION.description,
    parameters: toPiToolParameters(ASK_USER_TOOL_DEFINITION.parameters),
    execute: async (_toolCallId, params) => {
      const rawParams = params as AskUserToolParams;
      const input = normalizeAskUserInput(rawParams.input);
      const answer = await askUser(taskId, rawParams.question, rawParams.context, input);

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
