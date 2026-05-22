import type { Api, Model } from "@earendil-works/pi-ai";
import type { AIAdapter, ProviderConfig } from "./base";
import { PiAIAdapter } from "./pi-ai";

type GetModel = (provider: string, modelId: string) => Model<Api> | undefined;

const apiForProvider = (provider: string): Api => {
  if (provider === "anthropic") {
    return "anthropic-messages";
  }

  if (provider === "openai" || provider === "openrouter") {
    return "openai-completions";
  }

  if (provider === "google") {
    return "google-generative-ai";
  }

  return "openai-completions";
};

const createFallbackModel = (config: ProviderConfig): Model<Api> => {
  return {
    id: config.model.modelId,
    name: config.model.modelName || config.model.modelId,
    api: apiForProvider(config.provider),
    provider: config.vendor,
    baseUrl: config.baseUrl ?? "",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 8192,
  };
};

export const createAdapter = async (
  provider: string,
  config: ProviderConfig,
): Promise<AIAdapter> => {
  if (provider !== config.provider) {
    throw new Error(`Provider 类型不匹配：${provider} / ${config.provider}`);
  }

  const { getModel } = await import("@earendil-works/pi-ai");
  const model =
    (getModel as GetModel)(config.vendor, config.model.modelId) ??
    createFallbackModel(config);

  const configuredModel = {
    ...model,
    api: apiForProvider(config.provider),
    provider: config.vendor,
    name: config.model.modelName || model.name,
    baseUrl: config.baseUrl || model.baseUrl,
  };

  return new PiAIAdapter(config, configuredModel);
};
