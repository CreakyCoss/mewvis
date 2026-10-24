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
  duplicateProviderModel,
  moveProviderModel,
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
  resolveModelParameters,
  getMissingModelParameters,
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
import {
  parameterValueText,
  parseParameterJson,
  summarizeParameterSchema,
} from "../../src/workbench/pages/settings/llm/edit/model/parameter-json";
import {
  getParameterDefaultControl,
  getParameterDefaultError,
  parseParameterDefault,
  withParameterDefault,
} from "../../src/workbench/pages/settings/llm/edit/model/parameter-defaults";

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

test("copying a provider model keeps independent settings and inserts a uniquely named copy after it", () => {
  const draft = toLlmSettingsConfig({ providers: [provider({ models: [model(), model({ id: "next" })] })] })
    .providers[0];
  const source = draft.models[0];
  source.configuration = initialModelConfiguration(draft, source);
  source.limits = { contextWindow: 64000, maxTokens: 4000 };
  source.thinking = { levels: [{ value: "high", label: "High" }], defaultLevel: "high" };
  const before = structuredClone(draft);
  const duplicated = duplicateProviderModel(draft, source.id);
  const copy = duplicated.models[1];
  assert.deepEqual(draft, before);
  assert.equal(duplicated.models[0], source);
  assert.equal(duplicated.models[2], draft.models[1]);
  assert.notEqual(copy.id, source.id);
  assert.deepEqual(copy, { ...source, id: copy.id, modelName: "Flash（副本）" });
  copy.configuration!.purposes[0].input.push("image");
  copy.limits!.maxTokens = 2000;
  copy.thinking!.levels[0].label = "Changed";
  assert.deepEqual(source, before.models[0]);
  const repeated = duplicateProviderModel(duplicated, source.id);
  assert.equal(repeated.models[1].modelName, "Flash（副本 2）");
  assert.notEqual(repeated.models[1].id, copy.id);
  assert.equal(validateLlmSettingsConfig(normalizeLlmSettingsConfig({ providers: [repeated] })), "");
  assert.equal(duplicateProviderModel(draft, "missing"), draft);
});

test("moving provider models preserves identities and saved order and stops at the boundaries", () => {
  const draft = toLlmSettingsConfig({
    providers: [provider({ models: [model(), model({ id: "second" }), model({ id: "third" })] })],
  }).providers[0];
  const moved = moveProviderModel(draft, "second", -1);
  assert.deepEqual(
    draft.models.map((item) => item.id),
    ["m", "second", "third"],
  );
  assert.deepEqual(
    moved.models.map((item) => item.id),
    ["second", "m", "third"],
  );
  assert.equal(moved.models[0], draft.models[1]);
  assert.deepEqual(
    normalizeLlmSettingsConfig({ providers: [moved] }).providers[0].models.map((item) => item.id),
    ["second", "m", "third"],
  );
  assert.deepEqual(moveProviderModel(moved, "second", 1).models, draft.models);
  assert.equal(moveProviderModel(moved, "second", -1), moved);
  assert.equal(moveProviderModel(draft, "third", 1), draft);
  assert.equal(moveProviderModel(draft, "missing", 1), draft);
  assert.deepEqual(moveProviderModel({ ...draft, models: [] }, "m", -1).models, []);
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

test("parameters can require user choices without silently applying defaults", () => {
  const image = imagePurpose();
  const ratio = image.parameters.find((parameter) => parameter.name === "aspect_ratio")!;
  ratio.askWhenMissing = true;
  assert.equal(getModelConfigurationError(configuration([image])), "");
  assert.deepEqual(
    getMissingModelParameters(image).map((parameter) => parameter.name),
    ["aspect_ratio"],
  );
  assert.throws(() => resolveModelParameters(image), /aspect_ratio.*询问用户/);
  assert.throws(
    () =>
      buildModelRequest(image, {
        apiEndpoint: "https://api.example.com",
        model: { id: "image-01" },
        input: { prompt: "cat" },
        auth: { apiKey: "demo" },
      }),
    /aspect_ratio.*询问用户/,
  );
  assert.equal(resolveModelParameters(image, { aspect_ratio: "1:1" }).aspect_ratio, "1:1");
  assert.throws(() => resolveModelParameters(image, { aspect_ratio: "invalid-ratio" }), /结构要求/);
  const saved = normalizeLlmSettingsConfig(
    toLlmSettingsConfig({ providers: [provider({ models: [model({ configuration: configuration([image]) })] })] }),
  );
  assert.equal(saved.providers[0].models[0].configuration!.purposes[0].parameters[0].askWhenMissing, true);
  ratio.overridable = false;
  assert.match(getModelConfigurationError(configuration([image])), /允许覆盖/);
  ratio.overridable = true;
  (ratio as unknown as { askWhenMissing: unknown }).askWhenMissing = "yes";
  assert.match(getModelConfigurationError(configuration([image])), /询问开关/);
  image.parameters = [{ name: "n", type: "integer", default: 1, overridable: true, askWhenMissing: true,
    schema: { enum: [0, 1], minimum: 1 } }];
  assert.match(getModelConfigurationError(configuration([image])), /n 选项/);
});

test("explicit false, zero and empty string are provided values, while legacy parameters still use defaults", () => {
  const image = imagePurpose();
  image.parameters = [
    {
      name: "enabled",
      type: "boolean",
      default: true,
      overridable: true,
      askWhenMissing: true,
      schema: { enum: [true, false] },
    },
    { name: "seed", type: "integer", default: 1, overridable: true, askWhenMissing: true, schema: { enum: [0, 1] } },
    { name: "text", type: "string", default: "fallback", overridable: true, askWhenMissing: true },
    { name: "legacy", type: "integer", default: 2, overridable: true },
  ];
  const explicit = { enabled: false, seed: 0, text: "" };
  assert.deepEqual(getMissingModelParameters(image, explicit), []);
  assert.deepEqual(resolveModelParameters(image, explicit), { ...explicit, legacy: 2 });
  assert.deepEqual(
    getMissingModelParameters(image, { enabled: false }).map((parameter) => parameter.name),
    ["seed", "text"],
  );
  assert.throws(() => resolveModelParameters(image, { ...explicit, seed: "0" }), /结构要求/);
});

test("model choices summarize configured media purposes without mixing their modalities into conversation capabilities", () => {
  const purposes = [
    createModelPurpose("chat"),
    createModelPurpose("image-generation"),
    createModelPurpose("image-editing"),
    createModelPurpose("video-generation"),
    createModelPurpose("speech"),
    createModelPurpose("transcription"),
    createModelPurpose("realtime"),
  ];
  purposes[3].input.push("image");
  purposes[1].connection = { apiEndpoint: "https://media.example", apiKey: "media-secret", apiFormat: "http-json" };
  const p = provider({
    apiEndpoint: "https://chat.example",
    models: [model({ configuration: configuration(purposes) })],
  });
  const before = structuredClone(p);
  const runtimeBefore = buildRuntimeModelInputs({ providers: [p] });
  const [option] = buildRuntimeModelOptions({ providers: [p] });
  assert.deepEqual(option.capabilities.input, ["text"]);
  assert.deepEqual(option.capabilities.output, ["text"]);
  assert.deepEqual(option.capabilities.operations, ["chat"]);
  assert.deepEqual(option.mediaPurposes, [
    { type: "image-generation", input: ["text"], output: ["image"] },
    { type: "image-editing", input: ["text", "image"], output: ["image"] },
    { type: "video-generation", input: ["text", "image"], output: ["video"] },
    { type: "speech", input: ["text"], output: ["audio"] },
  ]);
  assert.doesNotMatch(JSON.stringify(option), /media-secret|chat\.example|media\.example|request|inputSchema/);
  assert.deepEqual(p, before);
  option.mediaPurposes[0].input.push("image");
  assert.deepEqual(buildRuntimeModelOptions({ providers: [p] })[0].mediaPurposes[0].input, ["text"]);
  assert.deepEqual(buildRuntimeModelInputs({ providers: [p] }), runtimeBefore);
});

test("media summaries respect configured connections, tool calling and the runtime's supported purposes", () => {
  const chat = createModelPurpose("chat");
  const image = createModelPurpose("image-generation");
  const options = (purposes: ModelPurpose[], apiEndpoint = "") =>
    buildRuntimeModelOptions({
      providers: [provider({ apiEndpoint, models: [model({ configuration: configuration(purposes) })] })],
    });
  assert.deepEqual(options([chat, image])[0].mediaPurposes, []);
  assert.equal(options([chat, image], "https://provider.example")[0].mediaPurposes[0].type, "image-generation");
  assert.equal(
    options([chat, { ...image, connection: { apiEndpoint: "" } }], "https://provider.example")[0].mediaPurposes.length,
    1,
    "Clearing a purpose endpoint restores provider inheritance",
  );
  assert.equal(
    options([chat, { ...image, request: { ...image.request!, path: "https://media.example/generate" } }])[0]
      .mediaPurposes.length,
    1,
  );
  assert.deepEqual(options([{ ...chat, toolCalling: false }, image], "https://provider.example")[0].mediaPurposes, []);
  assert.deepEqual(options([chat, { ...image, response: undefined }], "https://provider.example")[0].mediaPurposes, []);
  assert.deepEqual(
    options([chat, createModelPurpose("transcription")], "https://provider.example")[0].mediaPurposes,
    [],
  );
  const declaredOnly = model({
    capabilities: {
      operations: ["chat", "image-generation"],
      input: ["text"],
      output: ["text", "image"],
      reasoning: false,
      toolCalling: true,
    },
  });
  assert.deepEqual(
    buildRuntimeModelOptions({ providers: [provider({ models: [declaredOnly] })] })[0].mediaPurposes,
    [],
  );
});

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

test("explicit optional JSON values omit missing fields while preserving supplied values and strict variables", () => {
  const purpose = imagePurpose();
  purpose.parameters.push({ name: "optional", type: "object", overridable: true });
  const preview = (input: JsonValue = { prompt: "Sea" }) => previewModelRequest(purpose, {
    modelId: "image-01", apiEndpoint: "https://api.minimax.io", input,
  });
  purpose.request!.body = {
    image: "{{input.image?}}",
    params: "{{params.optional?}}",
    nested: { absent: "{{input.details.image?}}", kept: "{{input.zero?}}" },
    items: ["{{input.absent?}}", "{{input.zero?}}", null, false, 0, ""],
    zero: "{{input.zero?}}", off: "{{input.off?}}", empty: "{{input.empty?}}", nullable: "{{input.nullable?}}",
    object: "{{input.object?}}", array: "{{input.array?}}",
  };
  const input = { prompt: "Sea", zero: 0, off: false, empty: "", nullable: null, object: { value: 1 }, array: [1, 2] };
  const request = preview(input);
  assert.deepEqual(request.body, {
    nested: { kept: 0 }, items: [0, null, false, 0, ""],
    zero: 0, off: false, empty: "", nullable: null, object: { value: 1 }, array: [1, 2],
  });
  assert.doesNotMatch(JSON.stringify(request), /undefined/);
  purpose.request!.body = "{{input.absent?}}";
  assert.equal(Object.hasOwn(preview(), "body"), false);
  purpose.request!.body = { required: "{{input.absent}}" };
  assert.throws(() => preview(), /未提供值/);
  purpose.request!.body = { prompt: "{{input.prompt?}}" };
  assert.throws(() => preview({}), /应用输入/);
  for (const expression of ["{{params.unknown?}}", "{{input.constructor?}}", "{{input.image??}}"] ) {
    purpose.request!.body = { image: expression };
    assert.ok(getModelConfigurationError(configuration([purpose])), expression);
  }
  purpose.request!.body = { image: "prefix {{input.image?}}" };
  assert.match(getModelConfigurationError(configuration([purpose])), /可选变量仅支持/);
  purpose.request!.body = {};
  purpose.request!.path = "/images/{{input.image?}}";
  assert.match(getModelConfigurationError(configuration([purpose])), /可选变量仅支持/);
  purpose.request!.path = "/images";
  purpose.request!.headers["x-image"] = "{{input.image?}}";
  assert.match(getModelConfigurationError(configuration([purpose])), /可选变量仅支持/);
});

test("optional JSON nodes omit entire nested structures without rendering missing children", () => {
  const purpose = imagePurpose();
  const preview = (input: JsonValue) => previewModelRequest(purpose, {
    modelId: "image-01", apiEndpoint: "https://api.minimax.io", input,
  });
  purpose.request!.body = {
    content: [
      { type: "text", text: "{{input.prompt}}" },
      { $optional: "{{input.image?}}", $value: { type: "image_url", image_url: { url: "{{input.image}}" } } },
    ],
    optionalObject: { $optional: "{{input.details?}}", $value: { value: "{{input.details.value}}" } },
  };
  assert.deepEqual(preview({ prompt: "Sea" }).body, { content: [{ type: "text", text: "Sea" }] });
  assert.deepEqual(preview({ prompt: "Sea", image: "https://example.com/image.png", details: { value: 1 } }).body, {
    content: [{ type: "text", text: "Sea" }, { type: "image_url", image_url: { url: "https://example.com/image.png" } }],
    optionalObject: { value: 1 },
  });
  purpose.request!.body = { value: { $optional: "{{input.value?}}", $value: "{{input.value}}" } };
  for (const value of [null, false, 0, ""])
    assert.deepEqual(preview({ prompt: "Sea", value }).body, { value });
  for (const node of [
    { $optional: "{{input.image?}}" },
    { $optional: "{{input.image?}}", $value: {}, unexpected: true },
    { $optional: "{{input.image}}", $value: {} },
    { $optional: true, $value: {} },
    { $optional: "{{input.constructor?}}", $value: {} },
    { $optional: "{{params.unknown?}}", $value: {} },
  ]) {
    purpose.request!.body = node;
    assert.ok(getModelConfigurationError(configuration([purpose])));
  }
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

test("Hailuo 2.3 presets submit V1 payloads and resolve completed task file IDs", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  const m = createModelConfig(p, { modelId: "MiniMax-Hailuo-2.3", modelName: "Hailuo 2.3" });
  assert.equal(m.configuration?.purposes[0].preset?.id, "minimax-video-hailuo-2.3");
  assert.deepEqual(m.configuration?.purposes[0].input, ["text", "image"]);
  assert.equal(editorPresets.getModelTemplates("minimax-cn", "MiniMax-Hailuo-2.3").length, 1);
  const inputs: Record<string, JsonValue>[] = [{ prompt: "Sea" }, { prompt: "Sea", image: "https://example.com/first.png" }];
  for (const input of inputs) {
    const id = "minimax-video-hailuo-2.3";
    const purpose = editorPresets.instantiateTemplate(id, "video-generation");
    const options = { modelId: "MiniMax-Hailuo-2.3", apiEndpoint: "https://api.minimaxi.com/anthropic", input };
    const initial = previewModelRequest(purpose, options);
    const body = initial.body as Record<string, JsonValue>;
    assert.equal(initial.url, "https://api.minimaxi.com/v1/video_generation");
    assert.equal(body.model, options.modelId);
    assert.equal(body.duration, 6);
    assert.equal(body.resolution, "768P");
    assert.equal(body.prompt_optimizer, true);
    assert.equal(body.fast_pretreatment, false);
    assert.equal(body.first_frame_image, readJsonPointer(input, "/image"));
    assert.equal(Object.hasOwn(body, "first_frame_image"), Object.hasOwn(input, "image"));
    assert.deepEqual((purpose.inputSchema as { required: string[] }).required, ["prompt"]);
    assert.throws(() => previewModelRequest(purpose, { ...options, input: { prompt: "Sea", image: "" } }), /应用输入/);
    assert.throws(() => previewModelRequest(purpose, { ...options, input: { prompt: "Sea", image: null } }), /应用输入/);
    assert.equal((previewModelRequest(purpose, { ...options, overrides: { resolution: "1080P", duration: 6 } }).body as Record<string, JsonValue>).resolution, "1080P");
    assert.throws(() => previewModelRequest(purpose, { ...options, overrides: { duration: 8 } }), /不符合/);

    const ok = { base_resp: { status_code: 0 } };
    assert.equal(parseModelResponse(purpose, { ...ok, task_id: "job/1" }).taskId, "job/1");
    assert.equal(previewModelRequest(purpose, { ...options, phase: "result", taskId: "job/1" }).url,
      "https://api.minimaxi.com/v1/query/video_generation?task_id=job%2F1");
    for (const status of ["Preparing", "Queueing", "Processing"])
      assert.equal(parseModelResponse(purpose, { ...ok, status }, "result").status, "pending");
    assert.equal(parseModelResponse(purpose, { ...ok, status: "Fail" }, "result").status, "failed");
    const result = { ...ok, status: "Success", file_id: "file/1?x=y" };
    assert.deepEqual(parseModelResponse(purpose, result, "result"), { status: "retrieving", outputs: [] });
    const retrieve = previewModelRequest(purpose, { ...options, phase: "retrieve", result });
    assert.equal(retrieve.url, "https://api.minimaxi.com/v1/files/retrieve?file_id=file%2F1%3Fx%3Dy");
    assert.equal(retrieve.headers.Authorization, "••••••••");
    assert.equal(parseModelResponse(purpose, { ...ok, file: { download_url: "https://cdn.example/video.mp4" } }, "retrieve").outputs[0].value,
      "https://cdn.example/video.mp4");
    assert.equal(parseModelResponse(purpose, { base_resp: { status_code: 1004, status_msg: "Invalid key" } }, "retrieve").error, "Invalid key");
    assert.throws(() => previewModelRequest(purpose, { ...options, phase: "retrieve", result: {} }), /file_id/);
    purpose.request!.path = "/submit?file={{result.file_id}}";
    assert.match(getModelConfigurationError(configuration([purpose])), /未知变量/);
    purpose.request!.path = "/v1/video_generation";
    purpose.response!.task!.resultRequest!.path = "/file/{{result.__proto__.key}}";
    assert.match(getModelConfigurationError(configuration([purpose])), /变量路径无效/);
  }
});

test("H3 models use one template for text, first frame, last frame and paired frames", () => {
  for (const modelId of ["MiniMax-H3", "MiniMax-H3-Max"]) {
    const templates = editorPresets.getModelTemplates("minimax-cn", modelId);
    assert.equal(templates.length, 1);
    const purpose = templates[0].purpose;
    assert.deepEqual(purpose.input, ["text", "image"]);
    assert.deepEqual((purpose.inputSchema as { required: string[] }).required, ["prompt"]);
    const build = (input: JsonValue, overrides = {}) => previewModelRequest(purpose, {
      modelId, apiEndpoint: "https://api.minimaxi.com/anthropic", input, overrides,
    });
    for (const frames of [
      {},
      { image: "https://example.com/first.png" },
      { lastImage: "https://example.com/last.png" },
      { image: "https://example.com/first.png", lastImage: "https://example.com/last.png" },
    ]) {
      const request = build({ prompt: "Sea", ...frames });
      assert.equal(request.url, "https://api.minimaxi.com/v2/video_generation");
      assert.deepEqual(request.body, {
        model: modelId,
        content: [
          { type: "text", text: "Sea" },
          ...(frames.image ? [{ type: "image_url", image_url: { url: frames.image }, role: "first_frame" }] : []),
          ...(frames.lastImage ? [{ type: "image_url", image_url: { url: frames.lastImage }, role: "last_frame" }] : []),
        ],
        resolution: "768P", duration: 6, ratio: "16:9",
      });
      assert.doesNotMatch(JSON.stringify(request), /\$optional|\$value|undefined/);
    }
    const lowerDuration = modelId === "MiniMax-H3" ? 4 : 5;
    assert.doesNotThrow(() => build({ prompt: "Sea" }, { duration: lowerDuration }));
    assert.throws(() => build({ prompt: "Sea" }, { duration: lowerDuration - 1 }), /参数 duration/);
    assert.throws(() => build({ prompt: "Sea" }, { resolution: modelId === "MiniMax-H3" ? "480P" : "2K" }), /参数 resolution/);
    assert.throws(() => build({ prompt: "Sea", image: "" }), /应用输入/);
    assert.throws(() => build({ prompt: "Sea", lastImage: null }), /应用输入/);
    assert.throws(() => build({ image: "https://example.com/first.png" }), /应用输入/);
  }
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
    1,
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

test("parameter JSON accepts range defaults without enum and preserves complete schemas through settings round trips", () => {
  const p = applyProviderDefaults(createProviderConfig(true), "minimax-cn");
  const m = createModelConfig(p, { modelId: "image-01", modelName: "Image" });
  const purpose = m.configuration!.purposes.find((entry) => entry.type === "image-generation")!;
  const index = purpose.parameters.findIndex((parameter) => parameter.name === "n");
  const range = { ...purpose.parameters[index], schema: { description: "生成图片的数量", minimum: 1, maximum: 9 } };
  const rangeResult = parseParameterJson(JSON.stringify(range), purpose.parameters, index);
  assert.equal(rangeResult.error, "");
  assert.deepEqual(rangeResult.parameter, range);
  const combined = {
    ...range,
    askWhenMissing: true,
    schema: { ...range.schema, enum: [1, 2, 4], multipleOf: 1, allOf: [{ type: "integer" }] },
  };
  const result = parseParameterJson(JSON.stringify(combined), purpose.parameters, index);
  assert.equal(result.error, "");
  assert.deepEqual(result.parameter, combined);
  purpose.parameters[index] = result.parameter!;
  const saved = normalizeLlmSettingsConfig({ providers: [{ ...p, models: [m] }] });
  assert.equal(validateLlmSettingsConfig(saved), "");
  const reopened = initialModelConfiguration(saved.providers[0], saved.providers[0].models[0]);
  assert.deepEqual(reopened.purposes.find((entry) => entry.type === "image-generation")!.parameters[index], combined);
  const invalid = { ...combined, default: 3 };
  assert.match(parseParameterJson(JSON.stringify(invalid), purpose.parameters, index).error, /默认值.*enum/);
  assert.match(
    parseParameterJson(JSON.stringify({ ...range, default: 10 }), purpose.parameters, index).error,
    /默认值.*maximum/,
  );
});

test("parameter JSON validates syntax, structure, names and policies before replacing a row", () => {
  const parameters = [
    { name: "n", type: "integer" as const, default: 1, overridable: true },
    { name: "quality", type: "string" as const, overridable: true },
  ];
  const before = structuredClone(parameters);
  for (const value of [
    null,
    [],
    1,
    "text",
    { name: "n" },
    { ...parameters[0], name: "quality" },
    { ...parameters[0], name: "__proto__" },
    { ...parameters[0], description: "misplaced" },
    { ...parameters[0], askWhenMissing: "true" },
    { ...parameters[0], overridable: false, askWhenMissing: true },
    { ...parameters[0], schema: { minimum: "bad" } },
    { ...parameters[0], schema: { $ref: "https://example.com/schema" } },
  ]) {
    const result = parseParameterJson(JSON.stringify(value), parameters, 0);
    assert.ok(result.error, JSON.stringify(value));
    assert.equal(result.parameter, undefined);
  }
  const malformed = parseParameterJson('{"name":', parameters, 0);
  assert.match(malformed.error, /JSON 格式错误/);
  assert.equal(malformed.formatted, undefined);
  const formatted = parseParameterJson(JSON.stringify(parameters[0]), parameters, 0);
  assert.equal(formatted.formatted, JSON.stringify(parameters[0], null, 2));
  const missing = parseParameterJson(JSON.stringify(parameters[0]), parameters, 3);
  assert.match(missing.error, /不存在/);
  assert.deepEqual(parameters, before);
  const otherInvalid = [parameters[0], { ...parameters[1], default: false }];
  assert.equal(parseParameterJson(JSON.stringify(parameters[0]), otherInvalid, 0).error, "");
});

test("parameter JSON preserves false, zero, empty strings, omitted defaults and nested schemas without coercion", () => {
  const parameters = [{ name: "setting", type: "string" as const, overridable: true }];
  const definitions = [
    { name: "setting", type: "boolean", overridable: true, default: false },
    { name: "setting", type: "integer", overridable: true, default: 0 },
    {
      name: "setting",
      type: "string",
      overridable: true,
      default: "",
      schema: { enum: ["", "auto"], description: "允许空字符串" },
    },
    { name: "setting", type: "array", overridable: true, schema: { items: { type: "integer" }, minItems: 1 } },
    {
      name: "setting",
      type: "object",
      overridable: true,
      default: { quality: "high" },
      schema: {
        $defs: { quality: { type: "string", enum: ["high", "low"] } },
        properties: { quality: { $ref: "#/$defs/quality" } },
        required: ["quality"],
        additionalProperties: false,
      },
    },
  ];
  for (const definition of definitions) {
    const result = parseParameterJson(JSON.stringify(definition), parameters, 0);
    assert.equal(result.error, "", JSON.stringify(definition));
    assert.deepEqual(result.parameter, definition);
    assert.equal(Object.hasOwn(result.parameter!, "default"), Object.hasOwn(definition, "default"));
  }
  for (const askWhenMissing of [true, false]) {
    const definition = { ...definitions[0], askWhenMissing };
    const result = parseParameterJson(JSON.stringify(definition), parameters, 0);
    assert.equal(result.error, "");
    assert.equal(result.parameter!.default, false);
    assert.equal(result.parameter!.askWhenMissing, askWhenMissing);
  }
});

test("parameter summaries present combined descriptions, choices and ranges without dropping advanced rules", () => {
  assert.deepEqual(
    summarizeParameterSchema({
      description: "生成数量",
      enum: [1, 2, 4],
      minimum: 1,
      maximum: 9,
      multipleOf: 1,
      allOf: [{ type: "integer" }],
    }),
    ["生成数量", "可选值：1、2、4", "范围：≥ 1，≤ 9", "步长：1", "其他规则：allOf"],
  );
  assert.deepEqual(summarizeParameterSchema({ exclusiveMinimum: 0, exclusiveMaximum: 1, minLength: 0 }), [
    "范围：> 0，< 1",
    "最少字符：0",
  ]);
  assert.equal(parameterValueText(""), '""');
  assert.equal(parameterValueText(false), "false");
  assert.deepEqual(summarizeParameterSchema(false), ["不允许任何值"]);
  assert.deepEqual(summarizeParameterSchema(undefined), []);
});

test("default controls prefer enum, retain typed options and disable values outside the full schema", () => {
  const parameter = {
    name: "n",
    type: "integer" as const,
    overridable: true,
    schema: { enum: [0, 1, 2, 4, 10], minimum: 1, maximum: 9 },
  };
  const control = getParameterDefaultControl(parameter);
  assert.equal(control.type, "select");
  if (control.type !== "select") throw new Error("expected select");
  assert.deepEqual(control.options, [
    { value: 0, disabled: true },
    { value: 1, disabled: false },
    { value: 2, disabled: false },
    { value: 4, disabled: false },
    { value: 10, disabled: true },
  ]);
  for (const parameter of [
    { name: "enabled", type: "boolean" as const, overridable: true, schema: { enum: [false, true] } },
    { name: "mode", type: "string" as const, overridable: true, schema: { enum: ["", "auto"] } },
    {
      name: "object",
      type: "object" as const,
      overridable: true,
      schema: { enum: [{ quality: "high" }, { quality: "low" }] },
    },
  ]) {
    const control = getParameterDefaultControl(parameter);
    assert.equal(control.type, "select");
    if (control.type !== "select") throw new Error("expected select");
    assert.deepEqual(
      control.options.map((option) => option.value),
      parameter.schema.enum,
    );
    assert.ok(control.options.every((option) => !option.disabled));
  }
  const fixed = getParameterDefaultControl({ name: "n", type: "integer", overridable: true, schema: { const: 2 } });
  assert.deepEqual(fixed, { type: "select", options: [{ value: 2, disabled: false }] });
});

test("boolean defaults offer true and false and keep missing values distinct from false", () => {
  const parameter = {
    name: "enabled",
    type: "boolean" as const,
    overridable: true,
    askWhenMissing: true,
    schema: { description: "是否优化" },
  };
  assert.deepEqual(getParameterDefaultControl(parameter), {
    type: "select",
    options: [
      { value: true, disabled: false },
      { value: false, disabled: false },
    ],
  });
  const disabled = withParameterDefault(parameter, false);
  assert.equal(disabled.default, false);
  assert.equal(disabled.askWhenMissing, true);
  const cleared = withParameterDefault(disabled, undefined);
  assert.equal(Object.hasOwn(cleared, "default"), false);
  assert.deepEqual(cleared, parameter);
  assert.equal(Object.hasOwn(parameter, "default"), false);
});

test("number defaults infer inclusive and exclusive bounds and preserve number and integer validation", () => {
  const integer = { name: "n", type: "integer" as const, overridable: true, schema: { minimum: 1, maximum: 9 } };
  assert.deepEqual(getParameterDefaultControl(integer), { type: "number", min: 1, max: 9, step: 1 });
  assert.deepEqual(
    getParameterDefaultControl({
      ...integer,
      schema: { minimum: 1.2, maximum: 8.8, exclusiveMinimum: 2, exclusiveMaximum: 8 },
    }),
    { type: "number", min: 3, max: 7, step: 1 },
  );
  assert.deepEqual(parseParameterDefault(integer, "4"), { value: 4, error: "" });
  for (const raw of ["0", "10", "1.5", "bad", "1e400"]) assert.ok(parseParameterDefault(integer, raw).error, raw);
  assert.deepEqual(parseParameterDefault(integer, ""), { value: undefined, error: "" });
  const decimal = {
    ...integer,
    type: "number" as const,
    schema: { exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.25 },
  };
  assert.deepEqual(getParameterDefaultControl(decimal), { type: "number", min: 0, max: 1, step: "any" });
  assert.deepEqual(parseParameterDefault(decimal, "0.5"), { value: 0.5, error: "" });
  for (const raw of ["0", "1", "0.3"]) assert.ok(parseParameterDefault(decimal, raw).error, raw);
});

test("fallback defaults validate all schema rules without losing metadata or missing-value policy", () => {
  const text = {
    name: "style",
    type: "string" as const,
    default: "high",
    overridable: true,
    askWhenMissing: true,
    schema: { description: "图片风格", pattern: "^[a-z]+$", minLength: 3 },
  };
  const before = structuredClone(text);
  assert.deepEqual(getParameterDefaultControl(text), { type: "text" });
  assert.deepEqual(parseParameterDefault(text, "medium"), { value: "medium", error: "" });
  assert.ok(parseParameterDefault(text, "HI").error);
  const edited = withParameterDefault(text, "medium");
  assert.deepEqual(edited, { ...text, default: "medium" });
  assert.deepEqual(withParameterDefault(edited, undefined), {
    name: text.name,
    type: text.type,
    overridable: true,
    askWhenMissing: true,
    schema: text.schema,
  });
  assert.deepEqual(text, before);
  const object = {
    name: "options",
    type: "object" as const,
    overridable: true,
    schema: {
      properties: { quality: { type: "string", enum: ["high", "low"] } },
      required: ["quality"],
      additionalProperties: false,
    },
  };
  assert.deepEqual(getParameterDefaultControl(object), { type: "text" });
  assert.deepEqual(parseParameterDefault(object, '{"quality":"high"}'), { value: { quality: "high" }, error: "" });
  assert.ok(parseParameterDefault(object, '{"quality":"medium"}').error);
  assert.ok(parseParameterDefault(object, '{"quality":').error);
  assert.equal(
    getParameterDefaultError({ ...text, schema: { allOf: [{ pattern: "^high$" }] } }, "medium").includes("pattern"),
    true,
  );
});
