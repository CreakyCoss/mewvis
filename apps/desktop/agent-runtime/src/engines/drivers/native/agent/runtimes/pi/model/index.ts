import { getModel, type Api, type Model } from "@earendil-works/pi-ai";
import type { RuntimeApiFormat, RuntimeModelInput, RuntimeThinkingLevel } from "../../../../../../protocol/index.js";
import type { ChatRunCommand, RuntimeAgentCommand } from "../../types.js";

export const requirePiApiKey = (runtimeModel: RuntimeModelInput) => {
  const apiKey = runtimeModel.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`${runtimeModel.provider} 未配置 API Key`);
  }

  return apiKey;
};

export const requirePiRuntimeConfig = (
  command: Pick<RuntimeAgentCommand | ChatRunCommand, "runtimeModel">,
): RuntimeModelInput => {
  if (!command.runtimeModel) {
    throw new Error("Pi runtime 需要配置 LLM provider 和模型");
  }

  return command.runtimeModel;
};

export const resolvePiRuntimeThinkingLevel = (
  runtimeModel: Pick<RuntimeModelInput, "thinkingLevel">,
): RuntimeThinkingLevel | undefined => runtimeModel.thinkingLevel ?? undefined;

const piApiForFormat = (apiFormat: RuntimeApiFormat): Api => {
  switch (apiFormat) {
    case "anthropic-messages":
      return "anthropic-messages";
    case "google-generative-ai":
      return "google-generative-ai";
    case "openai-responses":
      return "openai-responses";
    case "azure-openai-responses":
      return "azure-openai-responses";
    case "openai-codex-responses":
      return "openai-codex-responses";
    case "openai-completions":
    case "openrouter":
      return "openai-completions";
  }
};

const readCatalogPiModel = (runtimeModel: RuntimeModelInput): Model<Api> | undefined =>
  (getModel as (provider: string, modelId: string) => Model<Api> | undefined)(
    runtimeModel.provider,
    runtimeModel.catalogModelId,
  );

export const createPiRuntimeModel = (runtimeModel: RuntimeModelInput): Model<Api> => {
  const catalogModel = readCatalogPiModel(runtimeModel);

  return {
    id: runtimeModel.modelId,
    name: runtimeModel.modelId,
    api: piApiForFormat(runtimeModel.apiFormat),
    provider: runtimeModel.provider,
    baseUrl: runtimeModel.apiEndpoint ?? catalogModel?.baseUrl ?? "",
    reasoning: runtimeModel.reasoning ?? catalogModel?.reasoning ?? true,
    thinkingLevelMap: runtimeModel.thinkingLevelMap ?? catalogModel?.thinkingLevelMap,
    input: runtimeModel.input ?? catalogModel?.input ?? ["text"],
    cost: runtimeModel.cost ??
      catalogModel?.cost ?? {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    contextWindow: runtimeModel.contextWindow ?? catalogModel?.contextWindow ?? 128000,
    maxTokens: runtimeModel.maxTokens ?? catalogModel?.maxTokens ?? 16384,
    headers: runtimeModel.headers ?? catalogModel?.headers,
  };
};
