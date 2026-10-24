import type { JsonValue, ModelParameter } from "@mewvis/chat-contracts";
import { getModelParametersError } from "@mewvis/chat-contracts/model-configuration";

export function withParameterDefault(parameter: ModelParameter, value: JsonValue | undefined): ModelParameter {
  const next = { ...parameter };
  if (value === undefined) delete next.default;
  else next.default = value;
  return next;
}

export function getParameterDefaultError(parameter: ModelParameter, value: JsonValue | undefined): string {
  return getModelParametersError([withParameterDefault(parameter, value)]);
}

type DefaultControl =
  | { type: "select"; options: { value: JsonValue; disabled: boolean }[] }
  | { type: "number"; min?: number; max?: number; step: number | "any" }
  | { type: "text" };

export function getParameterDefaultControl(parameter: ModelParameter): DefaultControl {
  const schema = parameter.schema && typeof parameter.schema === "object" ? parameter.schema : {};
  const values = Array.isArray(schema.enum)
    ? schema.enum
    : schema.const !== undefined
      ? [schema.const]
      : parameter.type === "boolean"
        ? [true, false]
        : undefined;
  if (values)
    return {
      type: "select",
      options: values.map((value) => ({ value, disabled: !!getParameterDefaultError(parameter, value) })),
    };
  if (parameter.type !== "integer" && parameter.type !== "number") return { type: "text" };
  const integer = parameter.type === "integer";
  const minimum = typeof schema.minimum === "number" ? schema.minimum : -Infinity;
  const maximum = typeof schema.maximum === "number" ? schema.maximum : Infinity;
  const exclusiveMinimum = typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum : -Infinity;
  const exclusiveMaximum = typeof schema.exclusiveMaximum === "number" ? schema.exclusiveMaximum : Infinity;
  const min = integer
    ? Math.max(Math.ceil(minimum), Math.floor(exclusiveMinimum) + 1)
    : Math.max(minimum, exclusiveMinimum);
  const max = integer
    ? Math.min(Math.floor(maximum), Math.ceil(exclusiveMaximum) - 1)
    : Math.min(maximum, exclusiveMaximum);
  return {
    type: "number",
    min: Number.isFinite(min) ? min : undefined,
    max: Number.isFinite(max) ? max : undefined,
    step: integer ? 1 : "any",
  };
}

export function parameterDefaultInput(parameter: ModelParameter): string {
  const value = parameter.default;
  return value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
}

export function parseParameterDefault(parameter: ModelParameter, raw: string) {
  if (raw === "" || (parameter.type !== "string" && !raw.trim())) return { value: undefined, error: "" };
  let value: JsonValue;
  try {
    value = parameter.type === "string" ? raw : JSON.parse(raw);
  } catch {
    return {
      error: parameter.type === "integer" || parameter.type === "number" ? "请输入有效数字" : "请输入有效 JSON 值",
    };
  }
  const error = getParameterDefaultError(parameter, value);
  return { value: error ? undefined : value, error };
}
