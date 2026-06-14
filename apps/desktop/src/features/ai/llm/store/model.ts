import type {
  RuntimeModelInput,
  RuntimeThinkingLevel,
} from "@/ai/runtime-protocol";
import { MODEL_CATALOG, type CatalogModel } from "@/ai/llm";
import type {
  LlmProvider,
  LlmSettings,
  ProviderModel,
} from "../types";

export type RuntimeModelOption = {
  id: string;
  provider: {
    id: string;
    name: string;
  };
  modelId: string;
  modelName: string;
};

type RuntimeModelInputMap = Record<string, RuntimeModelInput>;
type CatalogRuntimeModelInput = Pick<
  RuntimeModelInput,
  | "reasoning"
  | "thinkingLevel"
  | "thinkingLevelMap"
  | "input"
  | "cost"
  | "contextWindow"
  | "maxTokens"
  | "headers"
>;

const ONE_MILLION_CONTEXT_SUFFIX = "[1m]";
const THINKING_LEVELS: RuntimeThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

const withOneMillionContextSuffix = (value: string, enabled: boolean) => {
  const text = value.trim();

  if (!enabled || text.endsWith(ONE_MILLION_CONTEXT_SUFFIX)) {
    return text;
  }

  return `${text}${ONE_MILLION_CONTEXT_SUFFIX}`;
};

const formatProviderModelId = (
  model: Pick<ProviderModel, "modelId" | "isOneMillionContext">,
) => withOneMillionContextSuffix(model.modelId, model.isOneMillionContext);

const formatProviderModelName = (
  model: Pick<ProviderModel, "modelId" | "modelName" | "isOneMillionContext">,
) => withOneMillionContextSuffix(
  model.modelName.trim() || model.modelId,
  model.isOneMillionContext,
);

const getCatalogModel = (
  provider: Pick<LlmProvider, "provider">,
  model: Pick<ProviderModel, "modelId">,
): CatalogModel | null => {
  return MODEL_CATALOG[provider.provider]?.models[model.modelId] ?? null;
};

const resolveHighestThinkingLevel = (
  thinkingLevelMap: CatalogModel["thinkingLevelMap"],
): RuntimeThinkingLevel | null => {
  if (!thinkingLevelMap) {
    return null;
  }

  for (let index = THINKING_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = THINKING_LEVELS[index];
    if (Object.prototype.hasOwnProperty.call(thinkingLevelMap, level)) {
      return level;
    }
  }

  return null;
};

const createCatalogRuntimeModelInput = (
  catalogModel: CatalogModel,
): CatalogRuntimeModelInput => {
  return {
    reasoning: catalogModel.reasoning,
    thinkingLevel: resolveHighestThinkingLevel(catalogModel.thinkingLevelMap),
    input: [...catalogModel.input],
    cost: { ...catalogModel.cost },
    contextWindow: catalogModel.contextWindow,
    maxTokens: catalogModel.maxTokens,
    thinkingLevelMap: catalogModel.thinkingLevelMap
      ? { ...catalogModel.thinkingLevelMap }
      : undefined,
    headers: catalogModel.headers ? { ...catalogModel.headers } : undefined,
  };
};

const createRuntimeModelInput = (
  provider: LlmProvider,
  model: ProviderModel,
  modelId: string,
): RuntimeModelInput => {
  const catalogModel = getCatalogModel(provider, model);

  return {
    provider: provider.provider,
    apiFormat: provider.apiFormat,
    apiKey: provider.apiKey,
    catalogModelId: model.modelId,
    modelId,
    apiEndpoint: provider.apiEndpoint ?? undefined,
    ...(catalogModel ? createCatalogRuntimeModelInput(catalogModel) : {}),
  };
};

const buildRuntimeModelOption = (
  provider: LlmProvider,
  model: ProviderModel,
): RuntimeModelOption => {
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
  };
};

const buildRuntimeModelInput = (
  provider: LlmProvider,
  model: ProviderModel,
): RuntimeModelInput => {
  return createRuntimeModelInput(provider, model, formatProviderModelId(model));
};

export const buildRuntimeModelOptions = (
  settings: LlmSettings,
): RuntimeModelOption[] =>
  [...settings.providers]
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
    .flatMap((provider) =>
      provider.models
        .filter((model) => model.isEnabled)
        .map((model) => buildRuntimeModelOption(provider, model))
    );

export const buildRuntimeModelInputs = (
  settings: LlmSettings,
): RuntimeModelInputMap => {
  const inputs: RuntimeModelInputMap = {};

  for (const provider of settings.providers) {
    for (const model of provider.models) {
      if (!model.isEnabled) continue;

      inputs[model.id] = buildRuntimeModelInput(provider, model);
    }
  }

  return inputs;
};
