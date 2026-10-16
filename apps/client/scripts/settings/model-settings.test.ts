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
  initializeModelPreset,
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
import {
  applyPurposeTemplate,
  getPurposeConnectionError,
  initialModelConfiguration,
  updateModelPurpose,
} from "../../src/workbench/pages/settings/llm/edit/model/configuration";

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
  assert.equal(m.thinking, null);
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

test("speech templates configure independent audio generation and preserve it through settings and runtime snapshots", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "deepseek");
  p.apiKey = "chat-key";
  for (const modelId of ["speech-2.8-hd", "speech-2.8-turbo"]) {
    const m = createModelConfig(p, { modelId: "deepseek-flash", modelName: "Chat with speech" });
    const speech = applyPurposeTemplate(p, m, createModelPurpose("speech"), `minimax-${modelId}`);
    assert.equal(speech.modelId, modelId);
    assert.deepEqual(speech.input, ["text"]);
    assert.deepEqual(speech.output, ["audio"]);
    speech.connection!.apiKey = "speech-key";
    m.configuration!.purposes.push(speech);
    const saved = normalizeLlmSettingsConfig({ providers: [{ ...p, models: [m] }] });
    assert.equal(validateLlmSettingsConfig(saved), "");
    const runtime = createRuntimeModelInput(p, saved.providers[0].models[0]);
    assert.deepEqual(runtime.input, ["text", "image"]);
    const purpose = runtime.configuration!.purposes.find((entry) => entry.type === "speech")!;
    const request = buildModelRequest(
      purpose,
      {
        apiEndpoint: purpose.connection!.apiEndpoint!,
        auth: { apiKey: purpose.connection!.apiKey! },
        model: { id: purpose.modelId! },
        input: { text: "你好" },
      },
      { voice_id: "custom-voice", speed: 1.2 },
    );
    assert.equal(request.url, "https://api.minimaxi.com/v1/t2a_v2");
    assert.equal(request.headers.Authorization, "Bearer speech-key");
    const body = request.body as {
      model: string;
      stream: boolean;
      output_format: string;
      voice_setting: { voice_id: string; speed: number };
    };
    assert.equal(body.model, modelId);
    assert.equal(body.stream, false);
    assert.equal(body.output_format, "url");
    assert.equal(body.voice_setting.voice_id, "custom-voice");
    assert.equal(body.voice_setting.speed, 1.2);
    assert.deepEqual(
      parseModelResponse(purpose, {
        base_resp: { status_code: 0 },
        data: { audio: "https://cdn.example/speech.mp3" },
      }).outputs,
      [{ type: "audio", source: "url", value: "https://cdn.example/speech.mp3", mimeType: "audio/mpeg" }],
    );
  }
});

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
    models: [
      {
        modelId: "voice-1",
        label: "Voice 1",
        sourceUrls: ["https://example.com/docs/voice"],
        thinking: { "openai-completions": ["high", "custom-effort"] },
        templates: [
          { id: "example-chat", version: 1, label: "Chat", purpose: createModelPurpose("chat") },
          {
            id: "example-speech",
            version: 2,
            label: "Example Speech",
            purpose,
          },
        ],
      },
    ],
  };
  const common = structuredClone(commonPreset);
  common.thinkingLevels.find((level) => level.value === "high")!.label = "Shared High";
  common.modelDefaults.limits.contextWindow = 64000;
  const presets = createEditorPresets(common, [supplier]);
  const defaults = presets.createModelDefaults(
    { provider: "example", apiFormat: "openai-completions" },
    { modelId: "voice-1" },
  );
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
  assert.equal(presets.suggestTemplate("speech", "example", "voice-2"), undefined);
  assert.deepEqual(
    presets.getModelTemplates("example", "voice-1").map((preset) => preset.purpose.type),
    ["chat", "speech"],
  );
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
    () => createEditorPresets(common, [{ ...supplier, models: [...supplier.models, ...supplier.models] }]),
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
  const defaults = editorPresets.createModelDefaults(p, { modelId: "MiniMax-M3" });
  defaults.limits.contextWindow = 1000;
  defaults.limits.maxTokens = 100;
  assert.equal(editorPresets.createModelDefaults(p, { modelId: "MiniMax-M3" }).limits.contextWindow, 1000000);
  assert.equal(editorPresets.createModelDefaults(p, { modelId: "MiniMax-M3" }).limits.maxTokens, 524288);
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
    modelId: "MiniMax-M3",
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
    ["minimax-cn", "MiniMax-M3-custom"],
    ["custom", "MiniMax-M3"],
  ]) {
    assert.equal(
      createModelConfig({ ...p, provider }, { modelId, modelName: modelId }).limits?.contextWindow,
      commonPreset.modelDefaults.limits.contextWindow,
    );
  }
  assert.equal(
    createModelConfig({ ...p, provider: "minimax" }, { modelId: "MiniMax-M3", modelName: "M3" }).limits?.contextWindow,
    1000000,
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

test("new known models include every default purpose and reopening preserves removed purposes", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  const image = createModelConfig(p, { modelId: "image-01", modelName: "Image" });
  assert.deepEqual(
    image.configuration?.purposes.map((purpose) => purpose.type),
    ["image-generation", "image-editing"],
  );
  assert.deepEqual(image.capabilities?.output, ["image"]);
  assert.equal(image.capabilities?.reasoning, false);
  assert.equal(image.thinking, null);
  assert.equal(getModelConfigurationError(image.configuration), "");
  const video = createModelConfig(p, { modelId: "MiniMax-H3", modelName: "H3" });
  assert.equal(video.configuration?.purposes.length, 1);
  assert.equal(video.configuration?.purposes[0].preset?.id, "minimax-video-h3");
  assert.equal(
    editorPresets.listTemplates("video-generation").filter((preset) => preset.modelId === "MiniMax-H3").length,
    3,
  );
  const chat = createModelConfig(p, { modelId: "MiniMax-M3", modelName: "M3" });
  assert.deepEqual(
    chat.configuration?.purposes.map((purpose) => purpose.type),
    ["chat"],
  );
  const saved = structuredClone(image);
  saved.configuration!.purposes = [saved.configuration!.purposes[1]];
  saved.configuration!.purposes[0].parameters[0].default = "1:1";
  const reopened = initialModelConfiguration(p, saved);
  assert.deepEqual(reopened, saved.configuration);
  reopened.purposes[0].parameters[0].default = "9:16";
  assert.equal(saved.configuration!.purposes[0].parameters[0].default, "1:1");
  const fetched = appendDiscoveredModels({ ...p, models: [saved] }, [{ modelId: "image-01", modelName: "New Name" }]);
  assert.equal(fetched.models[0], saved);
});

test("typing an exact known ID initializes a new draft once and leaves existing edits alone", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  const blank = createModelConfig(p);
  blank.configuration = initialModelConfiguration(p, blank);
  assert.deepEqual(
    blank.configuration.purposes.map((purpose) => purpose.type),
    ["chat"],
  );
  const typed = initializeModelPreset(p, applyModelDefaults(blank, p.provider, "image-01"));
  assert.deepEqual(
    typed.configuration?.purposes.map((purpose) => purpose.type),
    ["image-generation", "image-editing"],
  );
  typed.configuration!.purposes.pop();
  assert.deepEqual(applyModelDefaults(typed, p.provider, "image-01").configuration, typed.configuration);
  const existing = applyModelDefaults(typed, p.provider, "MiniMax-M3");
  assert.deepEqual(existing.configuration, typed.configuration);
  const unknown = initializeModelPreset(p, applyModelDefaults(blank, p.provider, "image-01-future"));
  assert.deepEqual(
    unknown.configuration?.purposes.map((purpose) => purpose.type),
    ["chat"],
  );
});

test("every media preset builds its documented sample request with the owning model ID", () => {
  for (const preset of editorPresets.listTemplates().filter((preset) => preset.purpose.adapter === "http-json")) {
    assert.ok(preset.providerId, preset.id);
    assert.ok(preset.modelId, preset.id);
    assert.ok(preset.sourceUrl?.startsWith("https://"), preset.id);
    const p = editorPresets.getProvider(preset.providerId)!;
    const request = previewModelRequest(preset.purpose, {
      apiEndpoint: p.apis[0].apiEndpoint,
      modelId: preset.modelId,
      input: preset.sampleInput!,
    });
    assert.equal((request.body as { model: string }).model, preset.modelId, preset.id);
    assert.equal(new URL(request.url).origin, new URL(p.apis[0].apiEndpoint).origin, preset.id);
    assert.equal(request.headers["Content-Type"], "application/json", preset.id);
  }
  const edit = editorPresets.getTemplate("openai-gpt-image-2.5-sunburst-edit")!;
  const request = previewModelRequest(edit.purpose, {
    apiEndpoint: "https://api.openai.com/v1",
    modelId: edit.modelId!,
    input: { prompt: "Watercolor", images: [{ image_url: "data:image/png;base64,aGVsbG8=" }] },
  });
  assert.equal(request.url, "https://api.openai.com/v1/images/edits");
  assert.deepEqual((request.body as { images: unknown }).images, [{ image_url: "data:image/png;base64,aGVsbG8=" }]);
  const frames = editorPresets.getTemplate("cogvideox-3-frames")!;
  assert.deepEqual(
    (
      previewModelRequest(frames.purpose, {
        apiEndpoint: "https://open.bigmodel.cn/api/paas/v4",
        modelId: frames.modelId!,
        input: frames.sampleInput!,
      }).body as { image_url: unknown }
    ).image_url,
    ["https://example.com/first.png", "https://example.com/last.png"],
  );
  assert.equal(parseModelResponse(frames.purpose, { id: "job", task_status: "PROCESSING" }).status, "pending");
  assert.equal(
    parseModelResponse(frames.purpose, { task_status: "FAIL", error: { message: "Rejected" } }, "result").error,
    "Rejected",
  );
  assert.equal(
    parseModelResponse(
      frames.purpose,
      { task_status: "SUCCESS", video_result: [{ url: "https://example.com/video.mp4" }] },
      "result",
    ).outputs[0].value,
    "https://example.com/video.mp4",
  );
});

test("cross-supplier templates fill an independent connection and require the target supplier's key", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "deepseek");
  p.apiKey = "deepseek-secret";
  const m = createModelConfig(p, { modelId: "deepseek-flash", modelName: "Flash" });
  const originalChat = structuredClone(m.configuration!.purposes[0]);
  const image = applyPurposeTemplate(p, m, createModelPurpose("image-generation"), "minimax-image-01");
  assert.equal(image.modelId, "image-01");
  assert.deepEqual(image.connection, { apiEndpoint: "https://api.minimaxi.com", apiKey: "" });
  m.configuration!.purposes.push(image);
  assert.match(getPurposeConnectionError(p.provider, m.configuration), /MiniMax API Key/);
  p.models = [m];
  assert.match(validateLlmSettingsConfig(normalizeLlmSettingsConfig({ providers: [p] })), /MiniMax API Key/);
  image.connection!.apiKey = "minimax-secret";
  const missingEndpoint = structuredClone(m.configuration!);
  delete missingEndpoint.purposes[1].connection!.apiEndpoint;
  assert.match(getPurposeConnectionError(p.provider, missingEndpoint), /请求地址/);
  const missingModel = structuredClone(m.configuration!);
  delete missingModel.purposes[1].modelId;
  assert.match(getPurposeConnectionError(p.provider, missingModel), /请求模型 ID/);
  assert.equal(validateLlmSettingsConfig(normalizeLlmSettingsConfig({ providers: [p] })), "");
  const input = createRuntimeModelInput(p, m);
  assert.equal(input.apiKey, "deepseek-secret");
  assert.equal(input.modelId, "deepseek-flash");
  assert.deepEqual(m.configuration!.purposes[0], originalChat);
  const media = input.configuration!.purposes[1];
  assert.equal(media.connection!.apiKey, "minimax-secret");
  assert.equal(media.modelId, "image-01");
  const request = buildModelRequest(media, {
    apiEndpoint: media.connection!.apiEndpoint!,
    model: { id: media.modelId! },
    input: { prompt: "A cat" },
    auth: { apiKey: media.connection!.apiKey! },
  });
  assert.equal(request.headers.Authorization, "Bearer minimax-secret");
  assert.equal(request.url, "https://api.minimaxi.com/v1/image_generation");
  assert.equal((request.body as { model: string }).model, "image-01");
});

test("restoring preserves overrides while switching suppliers and models fills the new target", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "deepseek");
  const m = createModelConfig(p, { modelId: "deepseek-flash", modelName: "Flash" });
  const current = applyPurposeTemplate(p, m, createModelPurpose("image-generation"), "minimax-image-01");
  current.connection = { apiEndpoint: "https://my-proxy.example", apiKey: "minimax-key" };
  current.modelId = "my-image-alias";
  current.request!.path = "/custom";
  const restored = applyPurposeTemplate(p, m, current, current.preset!.id);
  assert.deepEqual(restored.connection, current.connection);
  assert.equal(restored.modelId, "my-image-alias");
  assert.equal(restored.request!.path, "/v1/image_generation");
  const switched = applyPurposeTemplate(p, m, restored, "openai-gpt-image-2.5-sunburst");
  assert.equal(switched.modelId, "gpt-image-2.5-sunburst");
  assert.deepEqual(switched.connection, { apiEndpoint: "https://api.openai.com", apiKey: "" });
  switched.connection!.apiKey = "openai-key";
  switched.connection!.apiEndpoint = "https://openai-proxy.example/v1";
  const anotherModel = applyPurposeTemplate(p, m, switched, "openai-gpt-image-2.5-flare");
  assert.equal(anotherModel.modelId, "gpt-image-2.5-flare");
  assert.deepEqual(anotherModel.connection, switched.connection);
  const localProvider = applyProviderDefaults(createProviderConfig(true), "openai");
  localProvider.apiEndpoint = "https://local-proxy.example/v1";
  const local = createModelConfig(localProvider, { modelId: "gpt-image-2.5-sunburst", modelName: "Image" });
  const own = applyPurposeTemplate(localProvider, local, current, "openai-gpt-image-2.5-sunburst");
  assert.equal(own.connection, undefined);
  assert.equal(own.modelId, undefined);
  assert.equal(resolveModelConnection(own, localProvider).apiEndpoint, localProvider.apiEndpoint);
  const custom = applyPurposeTemplate(p, m, restored, "custom-json");
  assert.deepEqual(custom.connection, restored.connection);
  assert.equal(custom.modelId, restored.modelId);
});

test("default template selection is scoped to one model and one purpose type", () => {
  const supplier: ProviderPreset = {
    id: "example",
    label: "Example",
    websiteUrl: "https://example.com",
    apis: [{ apiFormat: "openai-completions", apiEndpoint: "https://example.com" }],
    models: [
      {
        modelId: "hybrid",
        label: "Hybrid",
        sourceUrls: ["https://example.com/docs"],
        templates: [
          { id: "first-image", version: 1, label: "First", purpose: createModelPurpose("image-generation") },
          {
            id: "chosen-image",
            version: 1,
            label: "Chosen",
            isDefault: true,
            purpose: createModelPurpose("image-generation"),
          },
          { id: "hybrid-chat", version: 1, label: "Chat", purpose: createModelPurpose("chat") },
        ],
      },
    ],
  };
  const catalog = createEditorPresets(commonPreset, [supplier]);
  assert.deepEqual(
    catalog.getModelTemplates("example", "hybrid").map((preset) => preset.id),
    ["chosen-image", "hybrid-chat"],
  );
  assert.equal(catalog.suggestTemplate("image-generation", "example", "hybrid")?.id, "chosen-image");
  assert.equal(catalog.suggestTemplate("image-generation", "example", "hybrid-future"), undefined);
  assert.deepEqual(
    catalog.createModelDefaults({ provider: "example", apiFormat: "openai-completions" }, { modelId: "hybrid" })
      .capabilities.operations,
    ["image-generation", "chat"],
  );
  supplier.models[0].templates[0].isDefault = true;
  assert.throws(() => createEditorPresets(commonPreset, [supplier]), /默认模板重复/);
});

test("documented visual modalities do not expand the current chat bridge", () => {
  for (const [providerId, modelId] of [
    ["minimax-cn", "MiniMax-M3"],
    ["moonshotai-cn", "kimi-k3"],
    ["xiaomi", "mimo-v2.5"],
    ["zhipuai", "glm-5.3-flash"],
  ]) {
    const p = applyProviderDefaults(createProviderConfig(true), providerId);
    const m = createModelConfig(p, { modelId, modelName: modelId });
    assert.equal(getModelCapabilities(p, m).declared.input.includes("video"), true, modelId);
    assert.deepEqual(getModelCapabilities(p, m).available.input, ["text", "image"], modelId);
    assert.deepEqual(createRuntimeModelInput(p, m).input, ["text", "image"], modelId);
  }
});

test("selecting another native model fills its limits and effort suggestions without replacing the record ID", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "deepseek");
  const m = createModelConfig(p, { modelId: "deepseek-flash", modelName: "My Model" });
  const chat = applyPurposeTemplate(p, m, m.configuration!.purposes[0], "gpt-5.5-chat");
  chat.connection!.apiKey = "openai-key";
  const changed = updateModelPurpose(p, m, chat);
  assert.equal(changed.modelId, "deepseek-flash");
  assert.equal(changed.modelName, "My Model");
  assert.deepEqual(changed.limits, { contextWindow: 1050000, maxTokens: 128000 });
  assert.deepEqual(
    changed.thinking?.levels.map((level) => level.value),
    ["off", "low", "medium", "high", "xhigh"],
  );
  changed.limits = { contextWindow: 32000, maxTokens: 1000 };
  changed.thinking = { levels: [{ value: "custom", label: "Custom" }], defaultLevel: "custom" };
  const restored = updateModelPurpose(p, changed, applyPurposeTemplate(p, changed, chat, chat.preset!.id));
  assert.deepEqual(restored.limits, changed.limits);
  assert.deepEqual(restored.thinking, changed.thinking);
});

test("withdrawn preset IDs disappear from suggestions while reported metadata remains usable", () => {
  const withdrawn = [
    ["minimax-cn", "MiniMax-M2"],
    ["minimax-cn", "MiniMax-M2.1"],
    ["minimax-cn", "MiniMax-M2.1-highspeed"],
    ["minimax-cn", "MiniMax-M2.5"],
    ["minimax-cn", "MiniMax-M2.5-highspeed"],
    ["minimax-cn", "MiniMax-M2.7"],
    ["minimax-cn", "MiniMax-M2.7-highspeed"],
    ["openai", "gpt-image-1.5"],
    ["openai", "gpt-image-2"],
  ];
  for (const [providerId, modelId] of withdrawn) {
    assert.equal(editorPresets.getModel(providerId, modelId), undefined, modelId);
    assert.deepEqual(editorPresets.getModelTemplates(providerId, modelId), [], modelId);
    assert.equal(
      editorPresets.listTemplates().some((preset) => preset.providerId === providerId && preset.modelId === modelId),
      false,
      modelId,
    );
    const p = applyProviderDefaults(createProviderConfig(true), providerId);
    const imported = createModelConfig(p, { modelId, modelName: modelId });
    assert.equal(imported.configuration, null, modelId);
    assert.deepEqual(
      initialModelConfiguration(p, imported).purposes.map((purpose) => purpose.type),
      ["chat"],
      modelId,
    );
  }
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  const reported = createModelConfig(p, {
    modelId: "MiniMax-M2.7",
    modelName: "Legacy model",
    limits: { contextWindow: 204800, maxTokens: 65536 },
  });
  assert.deepEqual(reported.limits, { contextWindow: 204800, maxTokens: 65536 });
});

test("removing preset sources preserves saved legacy chat and media configurations", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  const legacy = createModelConfig(p);
  legacy.modelId = "MiniMax-M2.7";
  legacy.modelName = "My Legacy Chat";
  legacy.limits = { contextWindow: 204800, maxTokens: 65536 };
  const chat = createModelPurpose("chat");
  chat.preset = { id: "minimax-m2.7-chat", version: 1 };
  legacy.configuration = configuration([chat]);
  assert.equal(editorPresets.getTemplate(chat.preset.id), undefined);
  assert.deepEqual(initialModelConfiguration(p, legacy), legacy.configuration);
  assert.equal(createRuntimeModelInput(p, legacy).modelId, "MiniMax-M2.7");
  assert.equal(createRuntimeModelInput(p, legacy).contextWindow, 204800);
  const fetched = appendDiscoveredModels({ ...p, models: [legacy] }, [
    { modelId: legacy.modelId, modelName: "Replace" },
  ]);
  assert.equal(fetched.models[0], legacy);

  const openai = applyProviderDefaults(createProviderConfig(true), "openai");
  const media = createModelConfig(openai);
  media.modelId = "gpt-image-2";
  media.modelName = "My Legacy Image";
  const image = editorPresets.instantiateTemplate("openai-gpt-image-2.5-sunburst", "image-generation");
  image.preset = { id: "openai-image", version: 2 };
  image.parameters.find((parameter) => parameter.name === "quality")!.schema = {
    enum: ["auto", "low", "medium", "high"],
  };
  media.configuration = configuration([image]);
  assert.equal(editorPresets.getTemplate(image.preset.id), undefined);
  assert.deepEqual(initialModelConfiguration(openai, media), media.configuration);
  const saved = normalizeLlmSettingsConfig({ providers: [{ ...openai, models: [media] }] });
  assert.equal(validateLlmSettingsConfig(saved), "");
  assert.deepEqual(saved.providers[0].models[0].configuration, media.configuration);
  const request = previewModelRequest(image, {
    modelId: media.modelId,
    apiEndpoint: openai.apiEndpoint,
    input: { prompt: "A cat" },
  });
  assert.equal((request.body as { model: string }).model, "gpt-image-2");
  assert.equal(request.url, "https://api.openai.com/v1/images/generations");
});
