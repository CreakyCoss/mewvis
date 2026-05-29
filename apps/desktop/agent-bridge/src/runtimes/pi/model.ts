import {
  getModel,
  type Api,
  type Model,
} from "@earendil-works/pi-ai";
import type {
  ChatCommand,
  ModelInput,
  ProviderInput,
  StartTaskCommand,
} from "../../contracts/protocol.js";

export type PiModelSource = "input" | "catalog";

type CreatePiRuntimeModelOptions = {
  modelSource?: PiModelSource;
};

export const requirePiApiKey = (provider: ProviderInput) => {
  const apiKey = provider.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`${provider.name} 未配置 API Key`);
  }

  return apiKey;
};

export const requirePiRuntimeConfig = (
  command: Pick<StartTaskCommand | ChatCommand, "provider" | "model">,
): { provider: ProviderInput; model: ModelInput } => {
  if (!command.provider || !command.model) {
    throw new Error("Pi runtime 需要配置 LLM provider 和模型");
  }

  return {
    provider: command.provider,
    model: command.model,
  };
};

export const piApiForProvider = (provider: string): Api => {
  if (provider === "anthropic") {
    return "anthropic-messages";
  }

  if (provider === "google") {
    return "google-generative-ai";
  }

  return "openai-completions";
};

const resolveInputPiModel = (
  provider: ProviderInput,
  selectedModel: ModelInput,
): Model<Api> => ({
  id: selectedModel.modelId,
  name: selectedModel.modelId,
  api: piApiForProvider(provider.provider),
  provider: provider.vendor,
  baseUrl: "",
  reasoning: false,
  thinkingLevelMap: undefined,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128000,
  maxTokens: 16384,
  headers: undefined,
  compat: undefined,
});

const resolveCatalogPiModel = (
  provider: ProviderInput,
  selectedModel: ModelInput,
): Model<Api> | undefined =>
  (getModel as (provider: string, modelId: string) => Model<Api> | undefined)(
    provider.vendor,
    selectedModel.modelId,
  );

const applySelectedModelConfig = (
  baseModel: Model<Api>,
  provider: ProviderInput,
  selectedModel: ModelInput,
): Model<Api> => {
  return {
    ...baseModel,
    api: piApiForProvider(provider.provider),
    provider: provider.vendor,
    name: selectedModel.modelName || baseModel.name,
    baseUrl: provider.baseUrl ?? selectedModel.baseUrl ?? baseModel.baseUrl,
    reasoning: selectedModel.reasoning ?? baseModel.reasoning,
    thinkingLevelMap: selectedModel.thinkingLevelMap ?? baseModel.thinkingLevelMap,
    input: selectedModel.input ?? baseModel.input,
    cost: selectedModel.cost ?? baseModel.cost,
    contextWindow: selectedModel.contextWindow ?? baseModel.contextWindow,
    maxTokens: selectedModel.maxTokens ?? baseModel.maxTokens,
    headers: selectedModel.headers ?? baseModel.headers,
    compat: (selectedModel.compat ?? baseModel.compat) as Model<Api>["compat"],
  };
};

export const createPiRuntimeModel = (
  provider: ProviderInput,
  selectedModel: ModelInput,
  options: CreatePiRuntimeModelOptions = {},
): Model<Api> => {
  const baseModel = options.modelSource === "catalog"
    ? resolveCatalogPiModel(provider, selectedModel) ?? resolveInputPiModel(provider, selectedModel)
    : resolveInputPiModel(provider, selectedModel);

  return applySelectedModelConfig(baseModel, provider, selectedModel);
};
