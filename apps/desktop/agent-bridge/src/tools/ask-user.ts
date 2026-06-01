import { AskUserInputType, type AskUserInput, type AskUserOption } from "../contracts/protocol.js";
import type { ToolParameterDefinition } from "./types.js";

export const ASK_USER_TOOL_NAME = "ask_user";
export const ASK_USER_TOOL_LABEL = "Ask User";
export const ASK_USER_TOOL_DESCRIPTION = "Ask the user a question and wait for their answer. Use this whenever required information is missing, the user must choose a direction, or you need confirmation before continuing. Use text for open-ended answers. Use select only when you provide at least two options.";

export const ASK_USER_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "The question to show the user",
    },
    context: {
      type: "string",
      description: "Optional short context explaining why this is needed",
      optional: true,
    },
    input: {
      type: "object",
      optional: true,
      properties: {
        type: {
          type: "union",
          description: "The UI control type to render for the answer",
          anyOf: [
            { type: "literal", value: AskUserInputType.Text },
            { type: "literal", value: AskUserInputType.Select },
          ],
        },
        label: {
          type: "string",
          description: "Short label shown above the control",
          optional: true,
        },
        options: {
          type: "array",
          description: "Required when type is select. Provide at least two options. Option value may be omitted; label will be used as the returned value.",
          optional: true,
          items: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "Stable value returned to the agent when this option is selected. Optional; defaults to label.",
                optional: true,
              },
              label: {
                type: "string",
                description: "Human readable option label",
              },
              description: {
                type: "string",
                description: "Optional helper text for this option",
                optional: true,
              },
            },
          },
        },
        selected: {
          type: "string",
          description: "Default selected option value",
          optional: true,
        },
      },
    },
  },
} as const satisfies ToolParameterDefinition;

export type AskUserCall = {
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

export type AskUserToolParams = {
  question: string;
  context?: string | null;
  input?: unknown;
};

export const normalizeAskUserInput = (value: unknown): AskUserInput | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Partial<AskUserInput>;
  if (input.type !== AskUserInputType.Select && input.type !== AskUserInputType.Text) {
    return undefined;
  }

  return {
    type: input.type,
    label: typeof input.label === "string" ? input.label : undefined,
    selected: typeof input.selected === "string" ? input.selected : undefined,
    options: Array.isArray(input.options)
      ? input.options
        .reduce<AskUserOption[]>((options, option, index) => {
          if (!option || typeof option !== "object") {
            return options;
          }
          const item = option as Partial<AskUserOption>;
          const value = typeof item.value === "string" && item.value.trim()
            ? item.value
            : typeof item.label === "string" && item.label.trim()
              ? item.label
              : "";
          const label = typeof item.label === "string" && item.label.trim()
            ? item.label
            : value || `选项 ${index + 1}`;
          if (!value && !label) {
            return options;
          }
          options.push({
            value: value || label,
            label,
            description: typeof item.description === "string" ? item.description : undefined,
          });
          return options;
        }, [])
      : undefined,
  };
};
