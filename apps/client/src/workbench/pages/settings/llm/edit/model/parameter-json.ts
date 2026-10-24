import type { JsonSchema, JsonValue, ModelParameter } from "@mewvis/chat-contracts";
import { getModelParametersError, getSchemaOptions } from "@mewvis/chat-contracts/model-configuration";

export function parameterValueText(value: JsonValue): string {
  return typeof value === "string" && value.trim() ? value : JSON.stringify(value);
}

export function parseParameterJson(raw: string, parameters: ModelParameter[], index: number) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { error: `JSON 格式错误：${error instanceof Error ? error.message : "请检查输入"}` };
  }
  const formatted = JSON.stringify(parsed, null, 2);
  if (index < 0 || index >= parameters.length) return { formatted, error: "参数已不存在，请重新打开设置。" };
  let error = getModelParametersError([parsed]);
  if (!error && parameters.some((parameter, i) => i !== index && parameter.name === (parsed as ModelParameter).name))
    error = "参数名称不能重复";
  return { formatted, error, parameter: error ? undefined : (parsed as ModelParameter) };
}

export function summarizeParameterSchema(schema: JsonSchema | undefined): string[] {
  if (schema === false) return ["不允许任何值"];
  if (!schema || typeof schema !== "object") return [];
  const lines: string[] = [];
  if (typeof schema.description === "string" && schema.description.trim()) lines.push(schema.description);
  const options = getSchemaOptions(schema);
  if (options)
    lines.push(
      `可选值：${options
        .map((option) => {
          const value = parameterValueText(option.value);
          const label = option.label === value ? option.label : `${option.label}（${value}）`;
          return option.description ? `${label}：${option.description}` : label;
        })
        .join("、")}`,
    );
  if (schema.const !== undefined) lines.push(`限定值：${parameterValueText(schema.const)}`);
  const rules: string[] = [];
  const bounds = [
    ["minimum", "≥"],
    ["exclusiveMinimum", ">"],
    ["maximum", "≤"],
    ["exclusiveMaximum", "<"],
  ] as const;
  for (const [key, label] of bounds) if (typeof schema[key] === "number") rules.push(`${label} ${schema[key]}`);
  if (rules.length) lines.push(`范围：${rules.join("，")}`);
  const constraints = [
    ["multipleOf", "步长"],
    ["minLength", "最少字符"],
    ["maxLength", "最多字符"],
    ["minItems", "最少项数"],
    ["maxItems", "最多项数"],
    ["pattern", "匹配规则"],
  ] as const;
  for (const [key, label] of constraints)
    if (schema[key] !== undefined) lines.push(`${label}：${parameterValueText(schema[key])}`);
  const known = new Set<string>([
    "description",
    "enum",
    "options",
    "const",
    ...bounds.map(([key]) => key),
    ...constraints.map(([key]) => key),
  ]);
  const other = Object.keys(schema).filter((key) => !known.has(key));
  if (other.length) lines.push(`其他规则：${other.join("、")}`);
  return lines;
}
