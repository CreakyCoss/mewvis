import type { AgentRuntimeModelInput } from "@/ai/agent-runtime/contracts";
import { MODEL_CATALOG, type CatalogModel } from "../catalog";
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

type RuntimeModelInputMap = Record<string, AgentRuntimeModelInput>;
type CatalogRuntimeModelInput = Pick<
  AgentRuntimeModelInput,
  | "reasoning"
  | "thinkingLevelMap"
  | "input"
  | "cost"
  | "contextWindow"
  | "maxTokens"
  | "headers"
>;

const ONE_MILLION_CONTEXT_SUFFIX = "[1m]";

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

const createCatalogRuntimeModelInput = (
  catalogModel: CatalogModel,
): CatalogRuntimeModelInput => {
  return {
    reasoning: catalogModel.reasoning,
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
): AgentRuntimeModelInput => {
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
): AgentRuntimeModelInput => {
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
