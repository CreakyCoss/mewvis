import { MODEL_CATALOG } from "./model-catalog";
import { resolveModelCapabilities } from "@agent-runtime/engines/models/capabilities";
import type {
  RuntimeModelSummary,
  RuntimeApiFormat,
  RuntimeModelInput,
  RuntimeModelThinking,
  RuntimeModelCapabilities,
  RuntimeModelLimits,
} from "./wire";

export type ProviderModel = {
  id: string;
  providerId: string;
  modelId: string;
  modelName: string;
  isOneMillionContext: boolean;
  thinking?: RuntimeModelThinking | null;
  capabilities?: RuntimeModelCapabilities | null;
  limits?: RuntimeModelLimits | null;
  createdAt: number;
  updatedAt: number;
};

export type LlmProvider = {
  id: string;
  name: string;
  provider: string;
  apiFormat: RuntimeApiFormat;
  apiKey?: string | null;
  apiEndpoint?: string | null;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  models: ProviderModel[];
};

export type LlmSettings = {
  providers: LlmProvider[];
};

export type ProviderModelConfig = Omit<ProviderModel, "createdAt" | "updatedAt" | "providerId">;

export type LlmProviderConfig = Omit<LlmProvider, "apiEndpoint" | "apiKey" | "createdAt" | "updatedAt" | "models"> & {
  apiKey: string;
  apiEndpoint: string;
  models: ProviderModelConfig[];
};

export type LlmSettingsConfig = {
  providers: LlmProviderConfig[];
};

export type RuntimeModelOption = {
  id: string;
  provider: {
    id: string;
    name: string;
  };
  modelId: string;
  modelName: string;
  thinking?: RuntimeModelThinking;
  capabilities: RuntimeModelCapabilities;
};

export type RuntimeModelInputMap = Record<string, RuntimeModelInput>;

type CatalogRuntimeModelInput = Pick<
  RuntimeModelInput,
  "reasoning" | "input" | "cost" | "contextWindow" | "maxTokens" | "headers"
>;

const ONE_MILLION_CONTEXT_SUFFIX = "[1m]";

const withOneMillionContextSuffix = (value: string, enabled: boolean) => {
  const text = value.trim();

  if (!enabled || text.endsWith(ONE_MILLION_CONTEXT_SUFFIX)) {
    return text;
  }

  return `${text}${ONE_MILLION_CONTEXT_SUFFIX}`;
};

const formatProviderModelId = (model: Pick<ProviderModel, "modelId" | "isOneMillionContext">) =>
  withOneMillionContextSuffix(model.modelId, model.isOneMillionContext);

const formatProviderModelName = (model: Pick<ProviderModel, "modelId" | "modelName" | "isOneMillionContext">) =>
  withOneMillionContextSuffix(model.modelName.trim() || model.modelId, model.isOneMillionContext);

const getCatalogModel = (
  provider: Pick<LlmProvider, "provider">,
  model: Pick<ProviderModel, "modelId">,
): RuntimeModelSummary | null => {
  return Object.prototype.hasOwnProperty.call(MODEL_CATALOG, provider.provider)
    ? (MODEL_CATALOG[provider.provider]?.models[model.modelId] ?? null)
    : null;
};

export const getModelCapabilities = (
  provider: Pick<LlmProvider, "provider" | "apiFormat">,
  model: Pick<ProviderModel, "modelId" | "capabilities">,
) => resolveModelCapabilities({ ...provider, modelId: model.modelId, capabilities: model.capabilities });

export const getModelLimits = (
  provider: Pick<LlmProvider, "provider">,
  model: Pick<ProviderModel, "modelId" | "limits">,
) => {
  const catalog = getCatalogModel(provider, model);
  return {
    contextWindow: model.limits?.contextWindow ?? catalog?.contextWindow ?? 128000,
    maxTokens: model.limits?.maxTokens ?? catalog?.maxTokens ?? 16384,
  };
};

export const getModelLimitsError = (
  provider: Pick<LlmProvider, "provider">,
  model: Pick<ProviderModel, "modelId" | "limits">,
) => {
  const limits = getModelLimits(provider, model);
  if (
    [limits.contextWindow, limits.maxTokens].some(
      (value) => !Number.isInteger(value) || value < 1 || value > 2147483647,
    )
  )
    return "上下文和最大输出必须是有效的正整数";
  return limits.maxTokens > limits.contextWindow ? "最大输出不能超过上下文窗口（含默认值）" : "";
};

// Saved settings take precedence; the built-in catalog is only a frontend preset.
export const getModelThinking = (
  provider: Pick<LlmProvider, "provider" | "apiFormat">,
  model: Pick<ProviderModel, "modelId" | "thinking" | "capabilities">,
): RuntimeModelThinking | undefined => {
  if (!getModelCapabilities(provider, model).available.reasoning) return undefined;
  const thinking = model.thinking ?? getCatalogModel(provider, model)?.thinking?.[provider.apiFormat];
  return thinking ? structuredClone(thinking) : undefined;
};

const createCatalogRuntimeModelInput = (catalogModel: RuntimeModelSummary): CatalogRuntimeModelInput => {
  return {
    reasoning: catalogModel.reasoning,
    input: [...catalogModel.input],
    cost: { ...catalogModel.cost },
    contextWindow: catalogModel.contextWindow,
    maxTokens: catalogModel.maxTokens,
    headers: catalogModel.headers ? { ...catalogModel.headers } : undefined,
  };
};

export const createRuntimeModelInput = (
  provider: Pick<LlmProvider, "provider" | "apiFormat" | "apiKey" | "apiEndpoint">,
  model: Pick<ProviderModel, "modelId" | "thinking" | "capabilities" | "limits" | "isOneMillionContext">,
  modelId = formatProviderModelId(model),
): RuntimeModelInput => {
  const catalogModel = getCatalogModel(provider, model);
  const thinking = getModelThinking(provider, model);
  const capabilities = getModelCapabilities(provider, model);

  return {
    provider: provider.provider,
    apiFormat: provider.apiFormat,
    apiKey: provider.apiKey,
    catalogModelId: model.modelId,
    modelId,
    apiEndpoint: provider.apiEndpoint ?? undefined,
    ...(catalogModel ? createCatalogRuntimeModelInput(catalogModel) : {}),
    capabilities: capabilities.declared,
    input: capabilities.input,
    reasoning: model.capabilities != null || catalogModel ? capabilities.available.reasoning : undefined,
    ...(catalogModel ? getModelLimits(provider, model) : (model.limits ?? {})),
    thinkingLevel: thinking?.defaultLevel ?? undefined,
  };
};

const buildRuntimeModelOption = (provider: LlmProvider, model: ProviderModel): RuntimeModelOption => {
  const modelId = formatProviderModelId(model);
  const modelName = formatProviderModelName(model);

  return {
    id: model.id,
    provider: {
      id: provider.id,
      name: provider.name,
    },
    modelId,
    modelName,
    thinking: getModelThinking(provider, model),
    capabilities: getModelCapabilities(provider, model).available,
  };
};

const buildRuntimeModelInput = (provider: LlmProvider, model: ProviderModel): RuntimeModelInput => {
  return createRuntimeModelInput(provider, model, formatProviderModelId(model));
};

export const buildRuntimeModelOptions = (settings: LlmSettings): RuntimeModelOption[] =>
  [...settings.providers]
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
    .flatMap((provider) =>
      provider.models
        .filter((model) => getModelCapabilities(provider, model).available.operations.includes("chat"))
        .map((model) => buildRuntimeModelOption(provider, model)),
    );

export const buildRuntimeModelInputs = (settings: LlmSettings): RuntimeModelInputMap => {
  const inputs: RuntimeModelInputMap = {};

  for (const provider of settings.providers) {
    for (const model of provider.models) {
      inputs[model.id] = buildRuntimeModelInput(provider, model);
    }
  }

  return inputs;
};
