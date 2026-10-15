import Ajv from "ajv";

export const MODEL_PROTOCOLS = [
  "anthropic-messages",
  "openai-completions",
  "openai-codex-responses",
  "openai-responses",
  "azure-openai-responses",
  "google-generative-ai",
  "openrouter",
  "http-json",
];
export const MODEL_PARAMETER_TYPES = [
  "string",
  "integer",
  "number",
  "boolean",
  "object",
  "array",
];
const operations = [
  "chat",
  "image-generation",
  "image-editing",
  "video-generation",
  "speech",
  "transcription",
  "realtime",
];
const modalities = ["text", "image", "audio", "video"];
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
const schemaCache = new Map();
const compileSchema = (schema) => {
  const key = JSON.stringify(schema);
  const cached = schemaCache.get(key);
  if (cached) return cached;
  const validate = ajv.compile(schema);
  schemaCache.set(key, validate);
  if (schemaCache.size > 128) {
    const oldest = schemaCache.keys().next().value;
    ajv.removeSchema(schemaCache.get(oldest).schema);
    schemaCache.delete(oldest);
  }
  return validate;
};
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const own = (value, key) => value != null && Object.hasOwn(value, key);
const isObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
const fail = (message) => {
  throw new Error(message);
};
const keys = (value, allowed, label) => {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    fail(`${label}结构无效`);
};
const list = (value, allowed, label, nonempty = false) => {
  if (
    !Array.isArray(value) ||
    (nonempty && !value.length) ||
    new Set(value).size !== value.length ||
    value.some((item) => !allowed.includes(item))
  )
    fail(`${label}无效`);
};
const json = (value) => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) return value.forEach(json);
  if (isObject(value))
    return Object.entries(value).forEach(([key, item]) => {
      if (forbidden.has(key)) fail("JSON 含有保留字段");
      json(item);
    });
  fail("请使用有效的 JSON 值");
};
const checkSchema = (schema, label) => {
  if (schema === undefined) return;
  json(schema);
  if (typeof schema !== "boolean" && !isObject(schema))
    fail(`${label}必须是 JSON Schema`);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string" && !value.$ref.startsWith("#"))
      fail(`${label}仅支持文档内的 $ref`);
    Object.values(value).forEach(visit);
  };
  visit(schema);
  try {
    compileSchema(schema);
  } catch {
    fail(`${label}不是有效的 JSON Schema`);
  }
};
const matchesSchema = (schema, value, label) => {
  checkSchema(schema, label);
  if (schema === undefined) return;
  const validate = compileSchema(schema);
  if (!validate(value)) {
    const error = validate.errors?.[0];
    fail(
      `${label}${error?.instancePath || ""}不符合结构要求（${error?.keyword || "schema"}）`,
    );
  }
};
// Keep local $ref anchored at the parameter schema's root.
const parameterSchema = (param) =>
  isObject(param.schema)
    ? {
        ...param.schema,
        allOf: [{ type: param.type }, ...(param.schema.allOf ?? [])],
      }
    : { allOf: [{ type: param.type }, param.schema ?? true] };
const checkPointer = (pointer, label) => {
  if (
    typeof pointer !== "string" ||
    (pointer !== "" && !pointer.startsWith("/")) ||
    /~(?![01])/u.test(pointer)
  )
    fail(`${label}必须是 JSON Pointer，例如 /data/0/url`);
  if (
    pointer
      .split("/")
      .some((key) => forbidden.has(key.replace(/~1/g, "/").replace(/~0/g, "~")))
  )
    fail(`${label}含有保留字段`);
};
const checkVariables = (value, purpose, taskAllowed = false) => {
  if (Array.isArray(value))
    return value.forEach((item) => checkVariables(item, purpose, taskAllowed));
  if (isObject(value))
    return Object.values(value).forEach((item) =>
      checkVariables(item, purpose, taskAllowed),
    );
  if (typeof value !== "string") return;
  const matches = [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  if (
    value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, "").includes("{{") ||
    value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, "").includes("}}")
  )
    fail("变量格式无效，请使用 {{input.prompt}} 等形式");
  for (const match of matches) {
    const name = match[1].trim();
    const parts = name.split(".");
    if (parts.some((part) => !part || forbidden.has(part)))
      fail("变量路径无效");
    const allowed =
      name === "model.id" ||
      name === "input" ||
      name.startsWith("input.") ||
      name === "auth.apiKey" ||
      (taskAllowed && name === "task.id") ||
      (parts[0] === "params" &&
        purpose.parameters.some((param) => param.name === parts[1]));
    if (!allowed) fail(`未知变量：${name}`);
  }
};
const checkRequest = (request, purpose, taskAllowed = false) => {
  keys(request, ["method", "path", "headers", "body"], "请求配置");
  if (
    !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
    typeof request.path !== "string" ||
    !request.path.trim()
  )
    fail("请填写请求方式和路径");
  if (
    !isObject(request.headers) ||
    Object.entries(request.headers).some(
      ([name, value]) =>
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
        typeof value !== "string" ||
        /[\r\n]/.test(value),
    )
  )
    fail("请求头必须是字符串键值对");
  json(request);
  checkVariables(request, purpose, taskAllowed);
  if (request.method === "GET" && request.body !== undefined)
    fail("GET 请求不支持请求体");
  if (
    /^[a-z][a-z\d+.-]*:/i.test(request.path) &&
    !/^https?:\/\//i.test(request.path)
  )
    fail("请求地址仅支持 HTTP 或 HTTPS");
  if (request.path.startsWith("//")) fail("请使用完整 URL 或相对路径");
};

export function getModelConfigurationError(value) {
  try {
    keys(value, ["version", "purposes"], "模型配置");
    if (value.version !== 1) fail("模型配置版本无效");
    if (
      !Array.isArray(value.purposes) ||
      !value.purposes.length ||
      value.purposes.length > operations.length ||
      new Set(value.purposes.map((p) => p?.type)).size !== value.purposes.length
    )
      fail("请至少添加一种用途，每种用途只能添加一次");
    for (const purpose of value.purposes) {
      keys(
        purpose,
        [
          "type",
          "adapter",
          "connection",
          "modelId",
          "input",
          "output",
          "reasoning",
          "toolCalling",
          "inputSchema",
          "parameters",
          "request",
          "response",
          "preset",
        ],
        "用途配置",
      );
      if (
        !operations.includes(purpose.type) ||
        !["native", "http-json"].includes(purpose.adapter)
      )
        fail("用途或调用方式无效");
      if (
        purpose.modelId !== undefined &&
        (typeof purpose.modelId !== "string" || !purpose.modelId.trim())
      )
        fail("请填写用途的请求模型 ID，或选择使用顶部模型 ID");
      if (purpose.connection !== undefined) {
        const connection = purpose.connection;
        keys(connection, ["apiKey", "apiEndpoint", "apiFormat"], "用途连接");
        if (
          connection.apiKey !== undefined &&
          typeof connection.apiKey !== "string"
        )
          fail("API Key 必须是字符串");
        if (!MODEL_PROTOCOLS.includes(connection.apiFormat))
          fail("用途协议无效");
        if (
          typeof connection.apiEndpoint !== "string" ||
          !connection.apiEndpoint.trim()
        )
          fail("请填写用途的请求地址，或选择继承 Provider");
        let url;
        try {
          url = new URL(connection.apiEndpoint);
        } catch {
          fail("请求地址必须是完整的 HTTP 或 HTTPS URL");
        }
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          fail("请求地址无效，请把 Key 填入独立字段");
        if (
          purpose.adapter === "http-json" &&
          connection.apiFormat !== "http-json"
        )
          fail("HTTP / JSON 用途需要使用 HTTP / JSON 调用方式");
      }
      list(purpose.input, modalities, "输入类型", true);
      list(purpose.output, modalities, "输出类型", true);
      for (const field of ["reasoning", "toolCalling"])
        if (purpose[field] !== undefined && typeof purpose[field] !== "boolean")
          fail("思考和工具调用开关无效");
      if (purpose.preset !== undefined) {
        keys(purpose.preset, ["id", "version"], "预设来源");
        if (
          typeof purpose.preset.id !== "string" ||
          !purpose.preset.id ||
          !Number.isInteger(purpose.preset.version) ||
          purpose.preset.version < 1
        )
          fail("预设来源无效");
      }
      checkSchema(purpose.inputSchema, "输入 Schema");
      if (
        !Array.isArray(purpose.parameters) ||
        purpose.parameters.length > 100 ||
        new Set(purpose.parameters.map((p) => p?.name)).size !==
          purpose.parameters.length
      )
        fail("参数名称不能重复，最多支持 100 个参数");
      for (const param of purpose.parameters) {
        keys(
          param,
          ["name", "type", "default", "overridable", "schema"],
          "参数",
        );
        if (
          typeof param.name !== "string" ||
          !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(param.name) ||
          forbidden.has(param.name)
        )
          fail("参数名请使用字母、数字和下划线，且不能以数字开头");
        if (
          !MODEL_PARAMETER_TYPES.includes(param.type) ||
          typeof param.overridable !== "boolean"
        )
          fail("参数类型或覆盖开关无效");
        checkSchema(param.schema, `参数 ${param.name} 的 Schema`);
        if (own(param, "default")) {
          json(param.default);
          matchesSchema(
            parameterSchema(param),
            param.default,
            `参数 ${param.name} 默认值`,
          );
        }
      }
      if (purpose.adapter === "native") {
        if (purpose.connection?.apiFormat === "http-json")
          fail("原生对话需要对话协议；使用 HTTP / JSON 时请切换用途的请求模板");
        if (
          purpose.type !== "chat" ||
          purpose.parameters.length ||
          purpose.request ||
          purpose.response
        )
          fail("原生适配器仅支持对话，额外请求模板请使用 HTTP / JSON");
        continue;
      }
      checkRequest(purpose.request, purpose);
      const response = purpose.response;
      keys(
        response,
        ["mode", "outputs", "success", "errorPath", "task"],
        "返回处理",
      );
      if (
        !["direct", "task"].includes(response.mode) ||
        !Array.isArray(response.outputs) ||
        !response.outputs.length
      )
        fail("请配置返回方式和至少一条输出规则");
      for (const rule of response.outputs) {
        keys(
          rule,
          ["type", "source", "path", "itemPath", "mimeType"],
          "输出规则",
        );
        if (
          !purpose.output.includes(rule.type) ||
          !["url", "base64", "text", "json"].includes(rule.source)
        )
          fail("输出规则必须匹配已声明的输出类型");
        checkPointer(rule.path, "结果路径");
        if (rule.itemPath !== undefined)
          checkPointer(rule.itemPath, "数组元素路径");
        if (
          rule.mimeType !== undefined &&
          (typeof rule.mimeType !== "string" ||
            !/^[\w.+-]+\/[\w.+-]+$/.test(rule.mimeType))
        )
          fail("文件 MIME 类型无效");
      }
      if (response.success !== undefined) {
        keys(response.success, ["path", "equals"], "业务状态");
        checkPointer(response.success.path, "业务状态路径");
        json(response.success.equals);
      }
      if (response.errorPath !== undefined)
        checkPointer(response.errorPath, "错误信息路径");
      if (response.mode === "task") {
        keys(
          response.task,
          [
            "idPath",
            "request",
            "statusPath",
            "successValues",
            "failureValues",
            "intervalSeconds",
          ],
          "任务查询",
        );
        checkPointer(response.task.idPath, "任务 ID 路径");
        checkPointer(response.task.statusPath, "任务状态路径");
        checkRequest(response.task.request, purpose, true);
        if (
          ![response.task.successValues, response.task.failureValues].every(
            (v) =>
              Array.isArray(v) &&
              v.length &&
              v.every(
                (item) =>
                  typeof item === "string" ||
                  typeof item === "number" ||
                  typeof item === "boolean",
              ),
          )
        )
          fail("请配置任务成功和失败状态");
        if (
          response.task.successValues.some((v) =>
            response.task.failureValues.includes(v),
          )
        )
          fail("成功和失败状态不能重复");
        if (
          !Number.isInteger(response.task.intervalSeconds) ||
          response.task.intervalSeconds < 1 ||
          response.task.intervalSeconds > 3600
        )
          fail("查询间隔必须为 1–3600 秒");
      } else if (response.task !== undefined)
        fail("直接返回不需要任务查询配置");
    }
    json(value);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "模型配置无效";
  }
}

export function resolveModelConnection(purpose, provider) {
  const connection = purpose?.connection ?? provider;
  return {
    apiEndpoint: connection.apiEndpoint,
    apiFormat:
      purpose?.adapter === "http-json" ? "http-json" : connection.apiFormat,
    ...(connection.apiKey !== undefined ? { apiKey: connection.apiKey } : {}),
  };
}

export function resolveModelParameters(purpose, overrides = {}) {
  if (!isObject(overrides)) fail("调用参数必须是 JSON 对象");
  const result = {};
  for (const name of Object.keys(overrides)) {
    const param = purpose.parameters.find((p) => p.name === name);
    if (!param) fail(`未知调用参数：${name}`);
    if (!param.overridable) fail(`参数 ${name} 不允许应用覆盖`);
  }
  for (const param of purpose.parameters) {
    if (!own(overrides, param.name) && !own(param, "default")) continue;
    const value = own(overrides, param.name)
      ? overrides[param.name]
      : param.default;
    json(value);
    matchesSchema(parameterSchema(param), value, `参数 ${param.name}`);
    result[param.name] = structuredClone(value);
  }
  return result;
}
const variable = (name, context) => {
  let value = context;
  for (const part of name.trim().split(".")) {
    if (forbidden.has(part) || !own(value, part))
      fail(`变量 ${name.trim()} 未提供值`);
    value = value[part];
  }
  return value;
};
const scalar = (value) => {
  if (value !== null && typeof value === "object")
    fail("字符串内插和请求路径只能使用标量变量，对象或数组请使用整值变量");
  return String(value);
};
const renderString = (value, context, encode = false) =>
  value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name) => {
    const text = scalar(variable(name, context));
    return encode ? encodeURIComponent(text) : text;
  });
const renderJson = (value, context) => {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    return whole
      ? structuredClone(variable(whole[1], context))
      : renderString(value, context);
  }
  if (Array.isArray(value))
    return value.map((item) => renderJson(item, context));
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        renderJson(item, context),
      ]),
    );
  return value;
};
export function buildModelRequest(
  purpose,
  context,
  overrides = {},
  phase = "initial",
) {
  if (purpose.adapter !== "http-json") fail("原生对话由协议适配器组合请求");
  const configError = getModelConfigurationError({
    version: 1,
    purposes: [purpose],
  });
  if (configError) fail(configError);
  json(context.input);
  matchesSchema(purpose.inputSchema, context.input, "应用输入");
  const resolved = {
    ...context,
    params: resolveModelParameters(purpose, overrides),
  };
  const template =
    phase === "result" ? purpose.response?.task?.request : purpose.request;
  if (!template) fail("没有配置任务查询请求");
  const path = renderString(template.path, resolved, true);
  let url;
  try {
    url = /^https?:\/\//i.test(path)
      ? new URL(path)
      : new URL(path, context.apiEndpoint.replace(/\/+$/, "") + "/");
  } catch {
    fail("请先填写 Provider 或模型的完整请求地址");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    fail("请求地址仅支持 HTTP 或 HTTPS");
  const headers = Object.fromEntries(
    Object.entries(template.headers).map(([key, value]) => [
      key,
      renderString(value, resolved),
    ]),
  );
  if (Object.values(headers).some((value) => /[\r\n]/.test(value)))
    fail("请求头值含有无效换行");
  return {
    method: template.method,
    url: url.toString(),
    headers,
    ...(template.body !== undefined
      ? { body: renderJson(template.body, resolved) }
      : {}),
  };
}
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|api[-_]?key|token|secret|password|cookie/i.test(key)
          ? "••••••••"
          : redact(item),
      ]),
    );
  return value;
};
export function previewModelRequest(
  purpose,
  { modelId, apiEndpoint, input, overrides, taskId, phase = "initial" },
) {
  const result = buildModelRequest(
    purpose,
    {
      model: { id: modelId },
      apiEndpoint,
      input,
      auth: { apiKey: "••••••••" },
      ...(taskId ? { task: { id: taskId } } : {}),
    },
    overrides,
    phase,
  );
  const url = new URL(result.url);
  for (const key of [...url.searchParams.keys()])
    if (/key|token|secret|password/i.test(key))
      url.searchParams.set(key, "••••••••");
  return { ...redact(result), url: url.toString() };
}
export function readJsonPointer(value, pointer) {
  checkPointer(pointer, "路径");
  if (pointer === "") return value;
  for (const part of pointer.slice(1).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!own(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
export function parseModelResponse(purpose, value, phase = "initial") {
  const configError = getModelConfigurationError({
    version: 1,
    purposes: [purpose],
  });
  if (configError) fail(configError);
  json(value);
  const response = purpose.response;
  if (!response) fail("原生对话由协议适配器处理返回");
  const get = (path) =>
    path === undefined ? undefined : readJsonPointer(value, path);
  const error = () => {
    const detail = get(response.errorPath);
    return typeof detail === "string" && detail
      ? detail
      : "接口返回失败或未匹配返回规则";
  };
  if (
    response.success &&
    JSON.stringify(get(response.success.path)) !==
      JSON.stringify(response.success.equals)
  )
    return { status: "failed", error: error(), outputs: [] };
  if (response.mode === "task" && phase === "initial") {
    const id = get(response.task.idPath);
    if ((typeof id !== "string" && typeof id !== "number") || String(id) === "")
      fail("返回结果中没有找到任务 ID");
    return { status: "pending", taskId: String(id), outputs: [] };
  }
  if (response.mode === "task") {
    const status = get(response.task.statusPath);
    if (status === undefined) fail("返回结果中没有找到任务状态");
    if (response.task.failureValues.includes(status))
      return { status: "failed", error: error(), outputs: [] };
    if (!response.task.successValues.includes(status))
      return { status: "pending", outputs: [] };
  }
  const outputs = response.outputs.flatMap((rule) => {
    const extracted = get(rule.path);
    if (extracted === undefined || extracted === null) return [];
    const items = Array.isArray(extracted) ? extracted : [extracted];
    return items.flatMap((item) => {
      const result =
        rule.itemPath === undefined
          ? item
          : readJsonPointer(item, rule.itemPath);
      if (result === undefined || result === null) return [];
      if (rule.source !== "json" && typeof result !== "string")
        fail("输出规则期望字符串，请检查结果和数组元素路径");
      if (rule.source === "url" && !/^https?:\/\//i.test(result))
        fail("URL 输出必须是 HTTP 或 HTTPS 地址");
      return [
        {
          type: rule.type,
          source: rule.source,
          value: result,
          ...(rule.mimeType ? { mimeType: rule.mimeType } : {}),
        },
      ];
    });
  });
  if (!outputs.length)
    fail(
      typeof get(response.errorPath) === "string"
        ? error()
        : "返回结果未匹配任何输出规则",
    );
  return { status: "completed", outputs };
}

const request = (path, body) => ({
  method: "POST",
  path,
  headers: {
    Authorization: "Bearer {{auth.apiKey}}",
    "Content-Type": "application/json",
  },
  body,
});
export function createModelPurpose(
  type,
  adapter = type === "chat" ? "native" : "http-json",
) {
  const output = type.startsWith("image-")
    ? "image"
    : type === "video-generation"
      ? "video"
      : type === "speech"
        ? "audio"
        : "text";
  if (adapter === "native")
    return {
      type,
      adapter,
      input: ["text"],
      output: ["text"],
      reasoning: true,
      toolCalling: true,
      parameters: [],
    };
  return {
    type,
    adapter: "http-json",
    input:
      type === "transcription"
        ? ["audio"]
        : type === "image-editing"
          ? ["text", "image"]
          : ["text"],
    output: [output],
    inputSchema: { type: "object" },
    parameters: [],
    request: request("/your-endpoint", {
      model: "{{model.id}}",
      input: "{{input}}",
    }),
    response: {
      mode: "direct",
      outputs: [
        {
          type: output,
          source: output === "text" ? "text" : "url",
          path: "/data",
          ...(output === "text" ? {} : { itemPath: "/url" }),
        },
      ],
      errorPath: "/error/message",
    },
  };
}
