import test from "node:test";
import assert from "node:assert/strict";
import {
  createRuntimeModelInput,
  getModelThinking,
  buildRuntimeModelOptions,
  buildRuntimeModelInputs,
  getModelCapabilities,
  type LlmProvider,
  type ProviderModel,
  type LlmProviderConfig,
} from "../../src/agent-client/runtime-model";
import {
  applyModelDefaults,
  normalizeLlmSettingsConfig,
  toLlmSettingsConfig,
  validateLlmSettingsConfig,
  createModelConfig,
  createProviderConfig,
  applyProviderDefaults,
  appendDiscoveredModels,
} from "../../src/workbench/pages/settings/llm/edit/utils";
import { getDefaultApiFormat, getProviderOptions } from "../../src/workbench/pages/settings/llm/options";
import {
  createModelPurpose,
  getModelConfigurationError,
  previewModelRequest,
  buildModelRequest,
  parseModelResponse,
  readJsonPointer,
  resolveModelConnection,
} from "@mewvis/chat-contracts/model-configuration";
import type { ModelConfiguration, ModelPurpose } from "@mewvis/chat-contracts";
import { editorPresets } from "../../src/workbench/pages/settings/llm/edit/presets";
import { createEditorPresets } from "../../src/workbench/pages/settings/llm/edit/presets/resolve";
import { commonPreset } from "../../src/workbench/pages/settings/llm/edit/presets/common";
import type { ProviderPreset } from "../../src/workbench/pages/settings/llm/edit/presets/types";
import { initialModelConfiguration } from "../../src/workbench/pages/settings/llm/edit/model/configuration";

const model = (extra: Partial<ProviderModel> = {}): ProviderModel => ({
  id: "m",
  providerId: "p",
  modelId: "deepseek-flash",
  modelName: "Flash",
  isOneMillionContext: false,
  createdAt: 1,
  updatedAt: 2,
  ...extra,
});
const provider = (extra: Partial<LlmProvider> = {}): LlmProvider => ({
  id: "p",
  name: "DeepSeek",
  provider: "deepseek",
  apiFormat: "openai-completions",
  isDefault: true,
  apiKey: "test",
  models: [model()],
  createdAt: 1,
  updatedAt: 2,
  ...extra,
});

test("editor owns connection and model suggestions without a built-in model list", () => {
  const p = createProviderConfig(true);
  assert.deepEqual(p.models, []);
  assert.equal(getDefaultApiFormat("openai"), "openai-responses");
  assert.equal(
    getProviderOptions().some((option) => option.value === "minimax-cn"),
    true,
  );
  const m = createModelConfig(p);
  m.modelId = "discovered-future-model";
  assert.deepEqual(m.capabilities?.input, ["text"]);
  assert.equal(m.thinking?.defaultLevel, null);
  m.capabilities!.input.push("image");
  m.limits = { contextWindow: 400000, maxTokens: 10000 };
  const input = createRuntimeModelInput(p, m);
  assert.deepEqual(input.input, ["text", "image"]);
  assert.equal(input.contextWindow, 400000);
  p.models = [m];
  const changed = applyProviderDefaults(p, "deepseek");
  assert.deepEqual(changed.models, p.models);
  assert.equal(changed.apiEndpoint, "https://api.deepseek.com");
});

test("submitted capabilities reach runtime and missing values use generic fallbacks", () => {
  const p = provider();
  const configured = model({
    capabilities: {
      operations: ["chat"],
      input: ["text", "image", "audio", "video"],
      output: ["text", "audio"],
      reasoning: false,
      toolCalling: false,
    },
    thinking: { levels: [{ value: "high", label: "High" }], defaultLevel: "high" },
    limits: { contextWindow: 32000, maxTokens: 4000 },
  });
  const input = createRuntimeModelInput(p, configured);
  assert.deepEqual(input.input, ["text", "image"]);
  assert.equal(input.reasoning, false);
  assert.equal(input.thinkingLevel, undefined);
  assert.equal(input.capabilities?.toolCalling, false);
  assert.equal(input.contextWindow, 32000);
  assert.equal(input.maxTokens, 4000);
  assert.equal(getModelThinking(p, configured), undefined);
  const empty = model({ capabilities: { ...configured.capabilities!, input: [], output: [], operations: [] } });
  assert.deepEqual(buildRuntimeModelOptions({ providers: [provider({ models: [empty] })] }), []);
  const inherited = createRuntimeModelInput(p, { ...configured, capabilities: null, thinking: null, limits: null });
  assert.deepEqual(inherited.input, ["text"]);
  assert.equal(inherited.reasoning, undefined);
  assert.equal(inherited.thinkingLevel, undefined);
  const unknown = createRuntimeModelInput(
    provider({ provider: "custom" }),
    model({ modelId: "custom-model", limits: null }),
  );
  assert.equal(unknown.contextWindow, undefined);
  assert.equal(unknown.maxTokens, undefined);
  assert.equal(unknown.reasoning, undefined);
});

test("media models remain editable but are excluded from conversation choices", () => {
  const imageModel = model({
    id: "image",
    modelId: "drawing",
    capabilities: {
      operations: ["image-generation", "image-editing"],
      input: ["text", "image"],
      output: ["image"],
      reasoning: false,
      toolCalling: false,
    },
  });
  const p = provider({ models: [imageModel, model()] });
  assert.deepEqual(
    buildRuntimeModelOptions({ providers: [p] }).map((m) => m.id),
    ["m"],
  );
  const draft = toLlmSettingsConfig({ providers: [p] });
  const normalized = normalizeLlmSettingsConfig(draft);
  assert.deepEqual(normalized.providers[0].models[0].capabilities, imageModel.capabilities);
  assert.equal(normalized.providers[0].models[1].capabilities, null);
  assert.equal(validateLlmSettingsConfig(normalized), "");
  const changed = applyModelDefaults(draft.providers[0].models[0], "deepseek", "deepseek-v4-pro");
  assert.deepEqual(changed.capabilities, imageModel.capabilities);
  assert.equal(changed.limits, undefined);
  assert.equal(changed.thinking, undefined);
});

test("effective limits reject an override smaller than inherited output allowance", () => {
  const p = toLlmSettingsConfig({ providers: [provider()] }).providers[0] as LlmProviderConfig;
  p.models[0].limits = { contextWindow: 1000 };
  assert.match(validateLlmSettingsConfig({ providers: [p] }), /最大输出不能超过/);
  p.models[0].limits.maxTokens = 500;
  assert.equal(validateLlmSettingsConfig({ providers: [p] }), "");
});

test("providers without models can be saved and do not block changes to another provider's model", () => {
  const empty = provider({ id: "empty", name: "Connection only", apiEndpoint: "https://example.com", models: [] });
  const connectionOnly = normalizeLlmSettingsConfig(toLlmSettingsConfig({ providers: [empty] }));
  assert.equal(validateLlmSettingsConfig(connectionOnly), "");
  assert.deepEqual(connectionOnly.providers[0].models, []);
  const edited = provider({ apiEndpoint: "https://api.deepseek.com", models: [model({ modelName: "Updated model" })] });
  const combined = normalizeLlmSettingsConfig(toLlmSettingsConfig({ providers: [edited, empty] }));
  assert.equal(validateLlmSettingsConfig(combined), "");
  assert.equal(combined.providers[0].models[0].modelName, "Updated model");
  combined.providers[0].models[0].modelId = "";
  assert.match(validateLlmSettingsConfig(combined), /模型 ID 不能为空/);
});

test("typing a custom model ID follows its name and preserves deliberate custom settings", () => {
  let draft = toLlmSettingsConfig({ providers: [provider()] }).providers[0].models[0];
  draft = { ...draft, modelId: "", modelName: "", limits: { contextWindow: 64000, maxTokens: 4000 } };
  draft = applyModelDefaults(draft, "custom", "m");
  draft = applyModelDefaults(draft, "custom", "my-model");
  assert.equal(draft.modelName, "my-model");
  assert.equal(draft.limits?.contextWindow, 64000);
  const renamed = applyModelDefaults({ ...draft, modelName: "My model" }, "custom", "new-id");
  assert.equal(renamed.modelName, "My model");
  assert.equal(createRuntimeModelInput(provider({ provider: "custom" }), renamed).modelId, "new-id");
});

test("display names remain independent of request IDs across editing, saving and model choices", () => {
  const p = provider({ models: [model({ modelName: "My Flash" })] });
  const draft = toLlmSettingsConfig({ providers: [p] });
  assert.equal(draft.providers[0].models[0].modelName, "My Flash");
  draft.providers[0].models[0].modelName = "  Renamed Flash  ";
  const normalized = normalizeLlmSettingsConfig(draft);
  const saved = normalized.providers[0].models[0];
  assert.equal(saved.modelName, "Renamed Flash");
  assert.equal(saved.modelId, "deepseek-flash");
  assert.equal(createRuntimeModelInput(p, saved).modelId, "deepseek-flash");
  assert.equal(
    buildRuntimeModelOptions({ providers: [provider({ models: [model(saved)] })] })[0].modelName,
    "Renamed Flash",
  );
});

test("runtime IDs and capabilities are independent of any editor model catalog", () => {
  const legacyName = "deepseek-v4-flash";
  const configured = model({ modelId: legacyName });
  assert.equal(getModelCapabilities(provider(), configured).source, "fallback");
  assert.equal(createRuntimeModelInput(provider(), configured).modelId, legacyName);
});

const imagePurpose = () => editorPresets.instantiateTemplate("minimax-image-01", "image-generation");
const configuration = (purposes: ModelPurpose[]): ModelConfiguration => ({ version: 1, purposes });

test("all request presets validate and preserve typed template values", () => {
  for (const preset of editorPresets.listTemplates())
    assert.equal(getModelConfigurationError(configuration([preset.purpose])), "", preset.id);
  const request = previewModelRequest(imagePurpose(), {
    modelId: "image-01",
    apiEndpoint: "https://api.minimax.io/anthropic",
    input: { prompt: "Sea" },
    overrides: { n: 2, prompt_optimizer: false },
  });
  assert.equal(request.url, "https://api.minimax.io/v1/image_generation");
  assert.deepEqual(request.body, {
    model: "image-01",
    prompt: "Sea",
    aspect_ratio: "16:9",
    response_format: "url",
    n: 2,
    prompt_optimizer: false,
  });
  assert.equal(request.headers.Authorization, "••••••••");
  const purpose = imagePurpose();
  purpose.parameters.push({
    name: "references",
    type: "array",
    overridable: true,
    default: [{ url: "https://example.com/image.png" }],
    schema: {
      definitions: { item: { type: "object", required: ["url"], properties: { url: { type: "string" } } } },
      items: { $ref: "#/definitions/item" },
    },
  });
  purpose.request!.body = { nested: [{ images: "{{params.references}}", prompt: "A {{input.prompt}}" }] };
  const nested = previewModelRequest(purpose, {
    modelId: "image-01",
    apiEndpoint: "https://api.minimax.io",
    input: { prompt: "Sea" },
  });
  assert.deepEqual(nested.body, { nested: [{ images: [{ url: "https://example.com/image.png" }], prompt: "A Sea" }] });
});

test("input schemas, override rules, reserved names and unknown variables are enforced", () => {
  const purpose = imagePurpose();
  const preview = (input: unknown, overrides = {}) =>
    previewModelRequest(purpose, {
      modelId: "image-01",
      apiEndpoint: "https://api.minimax.io",
      input: input as never,
      overrides,
    });
  assert.throws(() => preview({}), /应用输入/);
  assert.throws(() => preview({ prompt: "Sea" }, { n: 10 }), /参数 n/);
  assert.throws(() => preview({ prompt: "Sea" }, { n: "2" }), /参数 n/);
  assert.throws(() => preview({ prompt: "Sea" }, { response_format: "base64" }), /不允许应用覆盖/);
  assert.throws(() => preview({ prompt: "Sea" }, { unknown: 1 }), /未知调用参数/);
  purpose.request!.body = { reference: "{{params.missing}}" };
  assert.match(getModelConfigurationError(configuration([purpose])), /未知变量/);
  purpose.request!.body = { reference: "{{input.constructor}}" };
  assert.match(getModelConfigurationError(configuration([purpose])), /变量路径/);
  purpose.request!.body = { reference: "{{input}} in a string" };
  assert.throws(() => preview({ prompt: "Sea" }), /标量/);
  purpose.inputSchema = { $ref: "https://example.com/schema" };
  assert.match(getModelConfigurationError(configuration([purpose])), /文档内/);
  purpose.inputSchema = { type: "object", properties: { prompt: { type: "str" } } };
  assert.match(getModelConfigurationError(configuration([purpose])), /JSON Schema/);
});

test("preview masks literal secrets and complete URLs do not require a base URL", () => {
  const purpose = imagePurpose();
  purpose.request!.path = "https://example.com/images?api_key=literal-secret";
  purpose.request!.headers["x-api-key"] = "literal-header-secret";
  purpose.request!.body = { api_key: "literal-body-secret", model: "{{model.id}}" };
  const preview = previewModelRequest(purpose, { modelId: "image-01", apiEndpoint: "", input: { prompt: "Sea" } });
  assert.doesNotMatch(JSON.stringify(preview), /literal-/);
  const request = buildModelRequest(purpose, {
    apiEndpoint: "",
    model: { id: "image-01" },
    input: { prompt: "Sea" },
    auth: { apiKey: "actual-key" },
  });
  assert.equal(request.headers.Authorization, "Bearer actual-key");
  purpose.request!.path = "/images/{{input.prompt}}";
  purpose.request!.body = {};
  assert.match(
    previewModelRequest(purpose, {
      modelId: "image-01",
      apiEndpoint: "https://example.com",
      input: { prompt: "a/b?x=1" },
    }).url,
    /a%2Fb%3Fx%3D1/,
  );
});

test("response extraction supports arrays, mixed outputs, business failures and asynchronous task envelopes", () => {
  const purpose = imagePurpose();
  purpose.output.push("text");
  purpose.response!.outputs.push({ type: "text", source: "text", path: "/caption" });
  const parsed = parseModelResponse(purpose, {
    base_resp: { status_code: 0 },
    data: { image_urls: ["https://example.com/1.png", "https://example.com/2.png"] },
    caption: "Seaside",
  });
  assert.equal(parsed.outputs.length, 3);
  assert.equal(parsed.outputs[2].type, "text");
  assert.equal(
    parseModelResponse(purpose, { base_resp: { status_code: 5, status_msg: "Invalid input" } }).status,
    "failed",
  );
  assert.equal(readJsonPointer({ "a/b": { "~c": ["ok"] } }, "/a~1b/~0c/0"), "ok");
  assert.throws(() => readJsonPointer({}, "/constructor"), /保留字段/);
  const video = editorPresets.instantiateTemplate("minimax-video-h3", "video-generation");
  assert.deepEqual(parseModelResponse(video, { task_id: "123" }), { status: "pending", taskId: "123", outputs: [] });
  assert.equal(parseModelResponse(video, { task: { status: "processing" } }, "result").status, "pending");
  assert.equal(
    parseModelResponse(
      video,
      { task: { status: "succeeded", content: { url: "https://example.com/video.mp4" } } },
      "result",
    ).outputs[0].value,
    "https://example.com/video.mp4",
  );
  assert.equal(
    parseModelResponse(video, { task: { status: "failed" }, error: { message: "Failed" } }, "result").error,
    "Failed",
  );
});

test("purpose connections and model IDs resolve independently before reaching runtime", () => {
  const chat = createModelPurpose("chat");
  chat.modelId = "chat-request-id";
  chat.connection = {
    apiKey: "chat-key",
    apiEndpoint: "https://chat.example/v1",
    apiFormat: "openai-responses",
  };
  const image = imagePurpose();
  image.modelId = "image-01";
  const configured = model({
    configuration: configuration([chat, image]),
  });
  const p = provider({ apiKey: "provider-key", apiEndpoint: "https://provider.example", models: [configured] });
  const input = createRuntimeModelInput(p, configured);
  assert.equal(input.modelId, "chat-request-id");
  assert.equal(input.catalogModelId, "chat-request-id");
  assert.equal(input.apiKey, "chat-key");
  assert.equal(input.apiEndpoint, "https://chat.example/v1");
  assert.equal(input.apiFormat, "openai-responses");
  assert.equal(input.configuration?.purposes[1].modelId, "image-01");
  assert.deepEqual(input.configuration?.purposes[1].connection, {
    apiKey: "provider-key",
    apiEndpoint: "https://provider.example",
    apiFormat: "http-json",
  });
  assert.equal(configured.configuration?.purposes[1].connection, undefined);
  assert.notEqual(input.configuration, configured.configuration);
  const submitted = structuredClone(input.configuration);
  configured.configuration!.purposes[1].parameters.length = 0;
  assert.deepEqual(input.configuration, submitted);
  assert.deepEqual(getModelCapabilities(p, configured).available.input, ["text"]);
  assert.deepEqual(getModelCapabilities(p, configured).declared.output, ["text", "image"]);
  assert.deepEqual(input.capabilities?.output, ["text"]);
  const saved = normalizeLlmSettingsConfig(toLlmSettingsConfig({ providers: [p] }));
  assert.deepEqual(saved.providers[0].models[0].configuration, configured.configuration);
  const media = model({ id: "image", configuration: configuration([imagePurpose()]) });
  assert.deepEqual(buildRuntimeModelInputs({ providers: [provider({ models: [media] })] }), {});
  chat.adapter = "http-json";
  assert.equal(getModelCapabilities(p, model({ configuration: configuration([chat]) })).available.operations.length, 0);
});

test("purpose connection fields inherit defaults individually and clearing overrides restores inheritance", () => {
  const p = provider({ apiKey: "provider-secret", apiEndpoint: "https://provider.example" });
  const image = imagePurpose();
  image.connection = { apiEndpoint: "https://images.example" };
  assert.deepEqual(
    resolveModelConnection(image, {
      apiEndpoint: p.apiEndpoint!,
      apiKey: p.apiKey!,
      apiFormat: p.apiFormat,
    }),
    { apiEndpoint: "https://images.example", apiFormat: "http-json", apiKey: "provider-secret" },
  );
  const input = createRuntimeModelInput(
    p,
    model({ configuration: configuration([createModelPurpose("chat"), image]) }),
  );
  assert.equal(input.configuration?.purposes[1].connection?.apiKey, "provider-secret");
  assert.equal(getModelConfigurationError(input.configuration), "");
  image.connection.apiEndpoint = "file:///private/config.db";
  assert.match(getModelConfigurationError(configuration([image])), /请求地址/);
  image.connection.apiEndpoint = "https://images.example";
  image.connection.apiFormat = "openai-responses";
  assert.match(getModelConfigurationError(configuration([image])), /HTTP \/ JSON/);
  image.connection.apiFormat = "http-json";
  image.modelId = " ";
  assert.equal(getModelConfigurationError(configuration([image])), "");
  delete image.connection;
  const inherited = createRuntimeModelInput(
    p,
    model({ configuration: configuration([createModelPurpose("chat"), image]) }),
  );
  assert.equal(inherited.configuration?.purposes[1].modelId, "deepseek-flash");
  assert.equal(inherited.configuration?.purposes[1].connection?.apiEndpoint, "https://provider.example");
  assert.match(
    getModelConfigurationError({ version: 1, connection: {}, purposes: [createModelPurpose("chat")] }),
    /结构无效/,
  );
});

test("resolved keyless media connections do not inherit an independently configured chat key", () => {
  const chat = createModelPurpose("chat");
  chat.connection = { apiKey: "chat-only-key" };
  const input = createRuntimeModelInput(
    provider({ apiKey: null, apiEndpoint: "https://provider.example" }),
    model({ configuration: configuration([chat, imagePurpose()]) }),
  );
  assert.equal(input.apiKey, "chat-only-key");
  const image = input.configuration!.purposes[1];
  assert.equal(image.connection?.apiKey, "");
  assert.equal(
    resolveModelConnection(image, {
      apiKey: input.apiKey!,
      apiEndpoint: input.apiEndpoint!,
      apiFormat: input.apiFormat,
    }).apiKey,
    "",
  );
});

test("supplier definitions share one processing path and saved configurations are independent snapshots", () => {
  const purpose = createModelPurpose("speech");
  purpose.request!.path = "/vendor/speech";
  const supplier: ProviderPreset = {
    id: "example",
    label: "Example",
    websiteUrl: "https://example.com",
    apis: [{ apiFormat: "openai-completions", apiEndpoint: "https://example.com" }],
    thinking: { "openai-completions": ["high", "custom-effort"] },
    templates: [
      {
        id: "example-speech",
        version: 2,
        label: "Example Speech",
        purpose,
        match: { modelPrefixes: ["voice-"] },
      },
    ],
  };
  const common = structuredClone(commonPreset);
  common.thinkingLevels.find((level) => level.value === "high")!.label = "Shared High";
  common.modelDefaults.limits.contextWindow = 64000;
  const presets = createEditorPresets(common, [supplier]);
  const defaults = presets.createModelDefaults({ provider: "example", apiFormat: "openai-completions" });
  assert.equal(defaults.limits.contextWindow, 64000);
  assert.deepEqual(defaults.thinking, {
    levels: [
      { value: "high", label: "Shared High" },
      { value: "custom-effort", label: "custom-effort" },
    ],
    defaultLevel: null,
  });
  assert.equal(presets.getProvider("example")?.apis[0].apiEndpoint, "https://example.com");
  assert.equal(presets.getDefaultApiFormat("example"), "openai-completions");
  assert.equal(
    presets.getApiFormats("example").some((option) => option.value === "anthropic-messages"),
    true,
  );
  assert.equal(
    presets.getApiFormats("unknown").some((option) => String(option.value) === "http-json"),
    false,
  );
  assert.equal(presets.listTemplates("speech").length, 1);
  assert.equal(presets.listTemplates("image-generation").length, 0);
  assert.equal(presets.suggestTemplate("speech", "example", "voice-1")?.id, "example-speech");
  assert.equal(presets.suggestTemplate("speech", "other", "voice-1"), undefined);
  const saved = presets.instantiateTemplate("example-speech", "speech");
  saved.request!.path = "/my/speech";
  purpose.request!.path = "/changed/source";
  supplier.apis[0].apiEndpoint = "https://changed.example";
  defaults.limits.contextWindow = 1000;
  common.modelDefaults.limits.contextWindow = 2000;
  assert.equal(presets.instantiateTemplate("example-speech", "speech").request!.path, "/vendor/speech");
  assert.equal(presets.getProvider("example")?.apis[0].apiEndpoint, "https://example.com");
  assert.equal(presets.createModelDefaults().limits.contextWindow, 64000);
  assert.deepEqual(saved.preset, { id: "example-speech", version: 2 });
  assert.throws(() => presets.instantiateTemplate("example-speech", "chat"), /不匹配/);
  assert.throws(() => createEditorPresets(common, [supplier, supplier]), /重复/);
  assert.throws(
    () => createEditorPresets(common, [{ ...supplier, templates: [...supplier.templates!, ...supplier.templates!] }]),
    /重复/,
  );
  // Loading or calling a saved configuration never needs the source template to be installed.
  assert.equal(createEditorPresets(common, []).getTemplate(saved.preset!.id), undefined);
  assert.equal(getModelConfigurationError(configuration([saved])), "");
  assert.equal(
    previewModelRequest(saved, { modelId: "voice-1", apiEndpoint: "https://example.com", input: { text: "hello" } })
      .url,
    "https://example.com/my/speech",
  );
  assert.equal(editorPresets.suggestTemplate("image-generation", "minimax-cn", "image-01")?.id, "minimax-image-01");
  assert.equal(editorPresets.suggestTemplate("image-generation", "minimax", "image-01")?.id, "minimax-image-01");
  assert.equal(editorPresets.suggestTemplate("image-generation", "other", "image-01"), undefined);
  assert.equal(editorPresets.suggestTemplate("chat", "custom", "any-model")?.id, "native-chat");
});

test("discovered metadata overrides defaults field by field, including false and empty values", () => {
  const p = createProviderConfig(true);
  const discovered = {
    modelId: "reported-model",
    modelName: "Reported Model",
    limits: { contextWindow: 64000, maxTokens: 8000 },
    capabilities: {
      operations: [] as ModelPurpose["type"][],
      input: [] as ModelPurpose["input"],
      output: [] as ModelPurpose["output"],
      reasoning: false,
      toolCalling: false,
    },
    thinking: { levels: ["high"] },
  };
  const imported = createModelConfig(p, discovered);
  assert.equal(imported.modelId, discovered.modelId);
  assert.equal(imported.modelName, discovered.modelName);
  assert.deepEqual(imported.capabilities, discovered.capabilities);
  assert.deepEqual(imported.limits, discovered.limits);
  assert.equal(imported.thinking, null);
  assert.deepEqual(buildRuntimeModelOptions({ providers: [provider({ models: [model(imported)] })] }), []);
  discovered.capabilities.input.push("image");
  discovered.limits.contextWindow = 1000;
  assert.deepEqual(imported.capabilities?.input, []);
  assert.equal(imported.limits?.contextWindow, 64000);
});

test("missing discovery fields use shared defaults and reported limits keep fallback values consistent", () => {
  const p = createProviderConfig(true);
  const imported = createModelConfig(p, {
    modelId: "new-model",
    modelName: "New Model",
    limits: { contextWindow: 4096 },
    capabilities: { input: ["text", "image"], reasoning: true },
    thinking: { levels: ["high", "custom-effort", "low"] },
  });
  assert.deepEqual(imported.capabilities?.operations, ["chat"]);
  assert.deepEqual(imported.capabilities?.output, ["text"]);
  assert.deepEqual(imported.capabilities?.input, ["text", "image"]);
  assert.deepEqual(imported.limits, { contextWindow: 4096, maxTokens: 4096 });
  assert.deepEqual(imported.thinking, {
    levels: [
      { value: "low", label: "低" },
      { value: "high", label: "高" },
      { value: "custom-effort", label: "custom-effort" },
    ],
    defaultLevel: null,
  });
  const outputOnly = createModelConfig(p, {
    modelId: "large-output",
    modelName: "Large Output",
    limits: { maxTokens: 262144 },
  });
  assert.deepEqual(outputOnly.limits, { contextWindow: 262144, maxTokens: 262144 });
  const emptyThinking = createModelConfig(p, {
    modelId: "no-efforts",
    modelName: "No Efforts",
    thinking: { levels: [] },
  });
  assert.deepEqual(emptyThinking.thinking, { levels: [], defaultLevel: null });
  assert.deepEqual(
    createModelConfig(p, { modelId: "name-only", modelName: "Name Only" }).thinking,
    createModelConfig(p).thinking,
  );
});

test("MiniMax imports fill documented model metadata before shared defaults", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  for (const modelId of [
    "MiniMax-M2",
    "MiniMax-M2.1",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
  ]) {
    const imported = createModelConfig(p, { modelId, modelName: modelId });
    assert.equal(imported.limits?.contextWindow, 204800, modelId);
    assert.equal(imported.limits?.maxTokens, 204800, modelId);
    assert.deepEqual(imported.capabilities?.input, ["text"]);
    assert.equal(imported.thinking, null);
    assert.equal(createRuntimeModelInput(p, imported).contextWindow, 204800);
    assert.equal(createRuntimeModelInput(p, imported).maxTokens, 204800);
  }
  for (const modelId of ["MiniMax-M3", "MiniMax-M3.1-Flash-Preview"]) {
    const added = appendDiscoveredModels(p, [{ modelId, modelName: modelId }]);
    assert.equal(added.models[0].limits?.contextWindow, 1000000);
    assert.equal(added.models[0].limits?.maxTokens, 524288);
    assert.equal(createRuntimeModelInput(p, added.models[0]).maxTokens, 524288);
    assert.deepEqual(added.models[0].capabilities?.input, ["text", "image", "video"]);
    assert.equal(validateLlmSettingsConfig(normalizeLlmSettingsConfig({ providers: [added] })), "");
  }
  for (const apiFormat of ["anthropic-messages", "openai-completions"] as const) {
    const imported = createModelConfig(
      { ...p, apiFormat },
      {
        modelId: "MiniMax-M3.1-Flash-Preview",
        modelName: "MiniMax-M3.1-Flash-Preview",
      },
    );
    assert.deepEqual(
      imported.thinking?.levels.map((level) => level.value),
      ["low", "medium", "high", "xhigh", "max"],
    );
    assert.equal(imported.thinking?.defaultLevel, null);
  }
  const defaults = editorPresets.createModelDefaults(p, { modelId: "MiniMax-M2.7" });
  defaults.limits.contextWindow = 1000;
  defaults.limits.maxTokens = 100;
  assert.equal(editorPresets.createModelDefaults(p, { modelId: "MiniMax-M2.7" }).limits.contextWindow, 204800);
  assert.equal(editorPresets.createModelDefaults(p, { modelId: "MiniMax-M2.7" }).limits.maxTokens, 204800);
});

test("reported MiniMax metadata wins per field and unknown IDs do not inherit another model's defaults", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  const reported = createModelConfig(p, {
    modelId: "MiniMax-M3.1-Flash-Preview",
    modelName: "Reported",
    limits: { maxTokens: 50000 },
    capabilities: { input: ["text"], toolCalling: false },
    thinking: { levels: [] },
  });
  assert.deepEqual(reported.limits, { contextWindow: 1000000, maxTokens: 50000 });
  assert.deepEqual(reported.capabilities?.input, ["text"]);
  assert.equal(reported.capabilities?.toolCalling, false);
  assert.deepEqual(reported.thinking, { levels: [], defaultLevel: null });
  const smaller = createModelConfig(p, {
    modelId: "MiniMax-M2.7",
    modelName: "Smaller gateway limit",
    limits: { contextWindow: 4096 },
  });
  assert.deepEqual(smaller.limits, { contextWindow: 4096, maxTokens: 4096 });
  const noReasoning = createModelConfig(p, {
    modelId: "MiniMax-M3.1-Flash-Preview",
    modelName: "No reasoning",
    capabilities: { reasoning: false, input: [] },
  });
  assert.equal(noReasoning.thinking, null);
  assert.deepEqual(noReasoning.capabilities?.input, []);
  for (const [provider, modelId] of [
    ["minimax-cn", "MiniMax-M2.7-custom"],
    ["custom", "MiniMax-M2.7"],
  ]) {
    assert.equal(
      createModelConfig({ ...p, provider }, { modelId, modelName: modelId }).limits?.contextWindow,
      commonPreset.modelDefaults.limits.contextWindow,
    );
  }
  assert.equal(
    createModelConfig({ ...p, provider: "minimax" }, { modelId: "MiniMax-M2.7", modelName: "M2.7" }).limits
      ?.contextWindow,
    204800,
  );
});

test("adding discovered models preserves existing user configurations and isolates multimodal purpose outputs", () => {
  const p = createProviderConfig(true);
  const existing = createModelConfig(p);
  Object.assign(existing, {
    modelId: "existing",
    modelName: "My Model",
    limits: { contextWindow: 32000, maxTokens: 4000 },
    thinking: { levels: [{ value: "mine", label: "Mine" }], defaultLevel: "mine" },
    configuration: configuration([createModelPurpose("chat")]),
  });
  p.models = [existing];
  const capabilities = {
    operations: ["chat", "image-generation"] as ModelPurpose["type"][],
    input: ["text", "image"] as ModelPurpose["input"],
    output: ["text", "image"] as ModelPurpose["output"],
    reasoning: true,
    toolCalling: true,
  };
  const discovered = { modelId: "new-multimodal", modelName: "Multimodal", capabilities };
  const added = appendDiscoveredModels(p, [
    { modelId: "existing", modelName: "Replace", limits: { contextWindow: 1000 } },
    discovered,
    discovered,
  ]);
  assert.equal(added.models.length, 2);
  assert.equal(added.models[0], existing);
  assert.equal(existing.modelName, "My Model");
  assert.deepEqual(existing.limits, { contextWindow: 32000, maxTokens: 4000 });
  assert.equal(existing.thinking?.defaultLevel, "mine");
  assert.equal(p.models.length, 1);
  const imported = added.models[1];
  const c = initialModelConfiguration(added, imported);
  assert.deepEqual(c.purposes.find((purpose) => purpose.type === "chat")?.output, ["text"]);
  assert.deepEqual(c.purposes.find((purpose) => purpose.type === "image-generation")?.output, ["image"]);
  assert.deepEqual(c.purposes.find((purpose) => purpose.type === "image-generation")?.input, ["text"]);
  assert.equal(getModelConfigurationError(c), "");
  const saved = normalizeLlmSettingsConfig({ providers: [added] });
  assert.equal(validateLlmSettingsConfig(saved), "");
  assert.deepEqual(saved.providers[0].models[1].capabilities, capabilities);
});
