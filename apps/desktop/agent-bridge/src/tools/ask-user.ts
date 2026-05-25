import { Type, type TSchema } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AskUser } from "../agents/types.js";
import type { AskUserInput, AskUserOption } from "../protocol.js";
import { findXmlElement, parseXmlFragment } from "../utils/xml.js";

type ParsedAskUserCall = {
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

export const normalizeAskUserInput = (value: unknown): AskUserInput | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Partial<AskUserInput>;
  if (input.type !== "select" && input.type !== "text") {
    return undefined;
  }

  return {
    type: input.type,
    label: typeof input.label === "string" ? input.label : undefined,
    selected: typeof input.selected === "string" ? input.selected : undefined,
    options: Array.isArray(input.options)
      ? input.options
        .reduce<AskUserOption[]>((options, option) => {
          if (!option || typeof option !== "object") {
            return options;
          }
          const item = option as Partial<AskUserOption>;
          if (typeof item.value !== "string" || typeof item.label !== "string") {
            return options;
          }
          options.push({
            value: item.value,
            label: item.label,
            description: typeof item.description === "string" ? item.description : undefined,
          });
          return options;
        }, [])
      : undefined,
  };
};

export const parseAskUserFunctionCall = (text: string): ParsedAskUserCall | null => {
  if (!text.includes("<invoke") || !text.includes("ask_user")) {
    return null;
  }

  const invoke = findXmlElement(
    parseXmlFragment(text),
    (element) => element.name === "invoke" && element.attributes.name === "ask_user",
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

export const registerAskUserTool = (
  pi: ExtensionAPI,
  taskId: string,
  askUser: AskUser,
) => {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description: "Ask the user a question and wait for their answer. Use this whenever required information is missing, the user must choose a direction, or you need confirmation before continuing. Use text for open-ended answers. Use select only when you provide at least two options.",
    parameters: Type.Object({
      question: Type.String({ description: "The question to show the user" }),
      context: Type.Optional(Type.String({ description: "Optional short context explaining why this is needed" })),
      input: Type.Optional(Type.Object({
        type: Type.Union([
          Type.Literal("text"),
          Type.Literal("select"),
        ], { description: "The UI control type to render for the answer" }),
        label: Type.Optional(Type.String({ description: "Short label shown above the control" })),
        options: Type.Optional(Type.Array(Type.Object({
          value: Type.String({ description: "Stable value returned to the agent when this option is selected" }),
          label: Type.String({ description: "Human readable option label" }),
          description: Type.Optional(Type.String({ description: "Optional helper text for this option" })),
        }), { description: "Required when type is select. Provide at least two options, optionally including { value: 'other', label: '请输入' } for free-form input." })),
        selected: Type.Optional(Type.String({ description: "Default selected option value" })),
      })),
    }) as TSchema,
    execute: async (_toolCallId, params) => {
      const rawParams = params as {
        question: string;
        context?: string | null;
        input?: unknown;
      };
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
