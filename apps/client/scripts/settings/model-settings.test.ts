import test from "node:test";
import assert from "node:assert/strict";
import { resolveModelCapabilities } from "../../../agent-runtime/src/engines/models/capabilities";
import { MODEL_CATALOG } from "../../../agent-runtime/src/engines/models";
import {
  createRuntimeModelInput,
  getModelThinking,
  buildRuntimeModelOptions,
  type LlmProvider,
  type ProviderModel,
  type LlmProviderConfig,
} from "../../src/agent-client/runtime-model";
import {
  applyModelDefaults,
  normalizeLlmSettingsConfig,
  toLlmSettingsConfig,
  validateLlmSettingsConfig,
} from "../../src/workbench/pages/settings/llm/edit/utils";
import { getDefaultApiFormat } from "../../src/workbench/pages/settings/llm/options";

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

test("official presets distinguish vision, video and text output, and keep media services unavailable", () => {
  const resolve = (
    provider: string,
    modelId: string,
    apiFormat: "openai-completions" | "openai-responses" | "anthropic-messages" = "openai-completions",
  ) => resolveModelCapabilities({ provider, modelId, apiFormat });
  assert.deepEqual(resolve("deepseek", "deepseek-flash").available.input, ["text", "image"]);
  assert.deepEqual(resolve("deepseek", "deepseek-v4-pro").declared.input, ["text"]);
  for (const format of ["openai-completions", "anthropic-messages"] as const) {
    const m3 = resolve("minimax-cn", "MiniMax-M3", format);
    assert.deepEqual(m3.declared.input, ["text", "image", "video"]);
    assert.deepEqual(m3.available.input, ["text", "image"]);
    assert.deepEqual(m3.available.output, ["text"]);
    assert.deepEqual(resolve("minimax-cn", "MiniMax-M2.7", format).available.input, ["text"]);
  }
  const openai = resolve("openai", "gpt-6-astra", "openai-responses");
  assert.equal(openai.source, "preset");
  assert.deepEqual(openai.declared.input, ["text", "image"]);
  assert.deepEqual(openai.declared.operations, ["chat"]);
  assert.equal(getDefaultApiFormat("openai"), "openai-responses");
  assert.equal(
    MODEL_CATALOG.openai.models["gpt-6-astra"].thinking?.["openai-responses"].levels.some(
      (level) => level.value === "off",
    ),
    false,
  );
});

test("custom capabilities reach runtime, explicit disable stays disabled, and inheritance restores presets", () => {
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
  assert.deepEqual(inherited.input, ["text", "image"]);
  assert.equal(inherited.reasoning, true);
  assert.equal(inherited.thinkingLevel, "high");
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
  assert.equal(changed.capabilities, null);
  assert.equal(changed.limits, null);
  assert.equal(changed.thinking, null);
});

test("effective limits reject an override smaller than inherited output allowance", () => {
  const p = toLlmSettingsConfig({ providers: [provider()] }).providers[0] as LlmProviderConfig;
  p.models[0].limits = { contextWindow: 1000 };
  assert.match(validateLlmSettingsConfig({ providers: [p] }), /最大输出不能超过/);
  p.models[0].limits.maxTokens = 500;
  assert.equal(validateLlmSettingsConfig({ providers: [p] }), "");
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

test("model presets use exact names and never replace a configured request name", () => {
  const legacyName = "deepseek-v4-flash";
  assert.equal(MODEL_CATALOG.deepseek.models[legacyName], undefined);
  const configured = model({ modelId: legacyName });
  assert.equal(
    resolveModelCapabilities({
      provider: "deepseek",
      modelId: legacyName,
      apiFormat: "openai-completions",
    }).source,
    "fallback",
  );
  assert.equal(createRuntimeModelInput(provider(), configured).modelId, legacyName);
});
