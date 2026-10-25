import type {
  JsonSchema,
  JsonValue,
  ModelParameter,
  ModelPurpose,
} from "@mewvis/chat-contracts/model-configuration";
import type { MediaArguments, MediaParameterQuestion } from "./types.js";
import {
  getSchemaOptions,
  resolveModelParameters,
} from "@mewvis/chat-contracts/model-configuration";

/** Collect input variables referenced by the configured templates, including polling. */
export function mediaInputPaths(purpose: ModelPurpose): string[] {
  const paths = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\{\{([^{}]+)\}\}/g)) {
        const path = match[1].trim().replace(/\?$/, "");
        if (path === "input" || path.startsWith("input.")) paths.add(path);
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object")
      Object.values(value).forEach(visit);
  };
  visit(purpose.request);
  visit(purpose.response?.task?.request);
  visit(purpose.response?.task?.resultRequest);
  return [...paths];
}

/** This is a format example, never a source of user answers or generated content. */
function inputExample(
  schema: JsonSchema | undefined,
  name = "input",
  depth = 0,
): JsonValue {
  if (!schema || typeof schema !== "object" || depth > 6)
    return `<${name}: 按 inputSchema 填写>`;
  if (schema.const !== undefined) return structuredClone(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length)
    return structuredClone(schema.enum[0]);
  if (schema.type === "object" || schema.properties) {
    const properties =
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties)
        ? schema.properties
        : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    return Object.fromEntries(
      required
        .filter((key): key is string => typeof key === "string")
        .map((key) => [
          key,
          inputExample(
            properties[key] as JsonSchema | undefined,
            key,
            depth + 1,
          ),
        ]),
    );
  }
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  if (schema.type === "null") return null;
  if (schema.type === "number" || schema.type === "integer")
    return typeof schema.minimum === "number" ? schema.minimum : 0;
  return `<${name}: 替换为实际内容>`;
}

/** Reused before generation and by the execution-time missing-parameter guard. */
export function mediaParameterQuestion(
  parameter: ModelParameter,
): MediaParameterQuestion {
  const schema =
    parameter.schema && typeof parameter.schema === "object"
      ? parameter.schema
      : undefined;
  const options = (getSchemaOptions(parameter.schema) ?? []).map((option) => ({
    value: JSON.stringify(option.value),
    label: option.label,
    ...(option.description ? { description: option.description } : {}),
  }));
  const context = [
    ...new Set(
      [
        parameter.description?.trim() ?? "",
        typeof schema?.description === "string"
          ? schema.description.trim()
          : "",
      ].filter(Boolean),
    ),
  ].join("\n");
  return {
    parameter: parameter.name,
    valueType: parameter.type,
    question:
      options.length >= 2
        ? `请选择 ${parameter.name}`
        : `请提供 ${parameter.name} 的明确值`,
    ...(context ? { context } : {}),
    input:
      options.length >= 2
        ? {
            type: "select",
            label: parameter.name,
            options,
            ...(Object.hasOwn(parameter, "default") &&
            options.some(
              (option) => option.value === JSON.stringify(parameter.default),
            )
              ? { selected: JSON.stringify(parameter.default) }
              : {}),
          }
        : { type: "text", label: parameter.name },
  };
}

export function mediaPurposeContract(
  purpose: ModelPurpose,
  selectedModelId: string,
) {
  const parameters = purpose.parameters.filter(
    (parameter) => parameter.overridable,
  );
  return {
    purpose: purpose.type,
    modelId: purpose.modelId?.trim() || selectedModelId,
    input: purpose.input,
    output: purpose.output,
    inputSchema: purpose.inputSchema ?? true,
    inputPaths: mediaInputPaths(purpose),
    parameters,
    parameterPaths: Object.fromEntries(
      parameters.map((parameter) => [
        parameter.name,
        `parameters.${parameter.name}`,
      ]),
    ),
    requiredUserParameters: parameters
      .filter((parameter) => parameter.askWhenMissing)
      .map((parameter) => parameter.name),
    // Templates are available for clarification, not a claim that these values are missing.
    questionTemplates: parameters.map(mediaParameterQuestion),
    callExample: {
      action: "generate" as const,
      purpose: purpose.type,
      input: inputExample(purpose.inputSchema),
      outputName: "<根据内容填写简短名称，不含扩展名>",
      parameters: Object.fromEntries(
        parameters
          .filter(
            (parameter) =>
              !parameter.askWhenMissing && parameter.default !== undefined,
          )
          .map((parameter) => [
            parameter.name,
            structuredClone(parameter.default!),
          ]),
      ),
    },
  };
}

export function mediaCallHelp(purpose?: ModelPurpose): string {
  if (!purpose)
    return '请先调用 {"action":"list"} 查看用途和 callExample；生成时使用 action="generate"。';
  const example = mediaPurposeContract(purpose, "").callExample;
  return `调用格式：${JSON.stringify(example)}。替换 input 和 outputName 示例内容；用户指定的可调参数放在 parameters 中，不能复制默认值覆盖用户要求。`;
}

/** Fail on ignored input rather than quietly generating with configured parameter defaults. */
export function assertMediaInputBindings(
  purpose: ModelPurpose,
  input: unknown,
): void {
  if (input === undefined) return; // A root files binding can supply the input later.
  const paths = mediaInputPaths(purpose);
  const unused: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (paths.some((used) => path === used || path.startsWith(`${used}.`)))
      return;
    if (value && typeof value === "object" && Object.keys(value).length) {
      for (const [key, child] of Object.entries(value))
        visit(child, `${path}.${key}`);
    } else if (
      path !== "input" &&
      !paths.some((used) => used.startsWith(`${path}.`))
    )
      unused.push(path);
  };
  visit(input, "input");
  if (!unused.length) return;
  const details = unused.slice(0, 5).map((path) => {
    const parameter = purpose.parameters.find(
      (parameter) => parameter.name === path.split(".").at(-1),
    );
    return parameter
      ? parameter.overridable
        ? `${path} 应放在 parameters.${parameter.name}`
        : `${path} 对应的参数不允许覆盖`
      : `${path} 未被请求模板使用`;
  });
  throw new Error(
    `输入字段位置不正确：${details.join("；")}。尚未提交生成请求。${mediaCallHelp(purpose)}`,
  );
}

export function assertMediaGenerationArguments(
  purpose: ModelPurpose,
  args: MediaArguments,
): void {
  if (args.action !== "generate")
    throw new Error(
      `生成必须使用 action="generate"。${mediaCallHelp(purpose)}`,
    );
  if (
    args.input === undefined &&
    !(
      Array.isArray(args.files) &&
      args.files.some(
        (file) =>
          file &&
          typeof file === "object" &&
          !Array.isArray(file) &&
          file.pointer === "",
      )
    )
  )
    throw new Error(
      `生成需要 input，或使用 files 绑定整个输入。尚未提交生成请求。${mediaCallHelp(purpose)}`,
    );
  assertMediaInputBindings(purpose, args.input);
  try {
    // Validate overrides without treating recommendations as user answers.
    // Discard the resolved values: the original purpose still enforces askWhenMissing.
    resolveModelParameters(
      {
        ...purpose,
        parameters: purpose.parameters.map((parameter) => ({
          ...parameter,
          askWhenMissing: false,
        })),
      },
      args.parameters ?? {},
    );
  } catch (error) {
    throw new Error(
      `可调参数无效：${error instanceof Error ? error.message : "请检查 parameters"}。尚未提交生成请求。${mediaCallHelp(purpose)}`,
    );
  }
}
