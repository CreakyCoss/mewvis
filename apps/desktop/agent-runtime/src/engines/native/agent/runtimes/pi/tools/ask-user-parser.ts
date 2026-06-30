import {
  ASK_USER_TOOL_DEFINITION,
  type AskUserToolCall,
  normalizeAskUserInput,
} from "../../../tools/ask-user.js";
import type { AskUserInput } from "../../../../../protocol/index.js";
import { findXmlElement, parseXmlFragment } from "../../../utils/xml.js";

export const parsePiAskUserFunctionCall = (text: string): AskUserToolCall | null => {
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
