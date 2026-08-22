import type { AskUserInput, AskUserOption } from "../../../../protocol/wire.js";
import type { ToolParameterDefinition } from "../../../../builtins/definition.js";

const stringParam = (description: string, optional?: boolean): ToolParameterDefinition => ({
  type: "string",
  description,
  optional,
});

const literalParam = (value: string): ToolParameterDefinition => ({
  type: "literal",
  value,
});

const objectParam = (
  properties: Record<string, ToolParameterDefinition>,
  optional?: boolean,
): ToolParameterDefinition => ({
  type: "object",
  properties,
  optional,
});

const ASK_USER_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    question: stringParam("The question to show the user"),
    context: stringParam("Optional short context explaining why this is needed", true),
    input: objectParam(
      {
        type: {
          type: "union",
          description: "The UI control type to render for the answer",
          anyOf: [literalParam("text"), literalParam("select")],
        },
        label: stringParam("Short label shown above the control", true),
        options: {
          type: "array",
          description:
            "Required when type is select. Provide at least two options. Option value may be omitted; label will be used as the returned value.",
          optional: true,
          items: objectParam({
            value: stringParam(
              "Stable value returned to the agent when this option is selected. Optional; defaults to label.",
              true,
            ),
            label: stringParam("Human readable option label"),
            description: stringParam("Optional helper text for this option", true),
          }),
        },
        selected: stringParam("Default selected option value", true),
      },
      true,
    ),
  },
} as const satisfies ToolParameterDefinition;

export const ASK_USER_TOOL_DEFINITION = {
  name: "ask_user",
  label: "Ask User",
  description:
    "Ask the user a question and wait for their answer. Use this whenever required information is missing, the user must choose a direction, or you need confirmation before continuing. Use text for open-ended answers. Use select only when you provide at least two options.",
  parameters: ASK_USER_TOOL_PARAMETERS,
} as const;

export type AskUserToolCall = {
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
  const input = objectFromUnknown(value);
  if (!input) {
    return undefined;
  }

  const type = normalizeInputType(input.type);
  if (!type) {
    return undefined;
  }

  return {
    type,
    label: optionalString(input.label),
    selected: optionalString(input.selected),
    options: normalizeOptions(input.options),
  };
};

const normalizeInputType = (value: unknown) => {
  if (value === "select" || value === "text") {
    return value;
  }

  return undefined;
};

const normalizeOptions = (value: unknown): AskUserOption[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((item, index) => {
    const option = normalizeOption(item, index);
    return option ? [option] : [];
  });
};

const normalizeOption = (value: unknown, index: number): AskUserOption | undefined => {
  const option = objectFromUnknown(value);
  if (!option) {
    return undefined;
  }

  const explicitValue = nonBlankString(option.value);
  const explicitLabel = nonBlankString(option.label);
  const label = explicitLabel ?? explicitValue ?? `选项 ${index + 1}`;

  return {
    value: explicitValue ?? label,
    label,
    description: optionalString(option.description),
  };
};

const objectFromUnknown = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

const optionalString = (value: unknown) => (typeof value === "string" ? value : undefined);

const nonBlankString = (value: unknown) => {
  const text = optionalString(value);
  return text?.trim() ? text : undefined;
};
