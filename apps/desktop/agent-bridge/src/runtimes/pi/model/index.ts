import {
  getModel,
  type Api,
  type Model,
} from "@earendil-works/pi-ai";
import type {
  RuntimeModelInput,
  RuntimeThinkingLevel,
} from "../../../contracts/model.js";
import type {
  RuntimeChatCommand,
  RuntimeStartTaskCommand,
} from "../../types.js";

export const requirePiApiKey = (runtimeModel: RuntimeModelInput) => {
  const apiKey = runtimeModel.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`${runtimeModel.provider} 未配置 API Key`);
  }

  return apiKey;
};

export const requirePiRuntimeConfig = (
  command: Pick<RuntimeStartTaskCommand | RuntimeChatCommand, "runtimeModel">,
): RuntimeModelInput => {
  if (!command.runtimeModel) {
    throw new Error("Pi runtime 需要配置 LLM provider 和模型");
  }

  return command.runtimeModel;
};

export const resolvePiRuntimeThinkingLevel = (
  runtimeModel: Pick<RuntimeModelInput, "thinkingLevel">,
): RuntimeThinkingLevel | undefined => runtimeModel.thinkingLevel ?? undefined;

const piApiForFormat = (apiFormat: string): Api => {
  if (apiFormat === "anthropic" || apiFormat === "anthropic-messages") {
    return "anthropic-messages";
  }

  if (apiFormat === "google" || apiFormat === "google-generative-ai") {
    return "google-generative-ai";
  }

  if (apiFormat === "openai-responses") {
    return "openai-responses";
  }

  if (apiFormat === "azure-openai-responses") {
    return "azure-openai-responses";
  }

  if (apiFormat === "openai-codex-responses") {
    return "openai-codex-responses";
  }

  if (apiFormat === "openrouter") {
    return "openai-completions";
  }

  return "openai-completions";
};

const readCatalogPiModel = (
  runtimeModel: RuntimeModelInput,
): Model<Api> | undefined =>
  (getModel as (provider: string, modelId: string) => Model<Api> | undefined)(
    runtimeModel.provider,
    runtimeModel.catalogModelId,
  );

export const createPiRuntimeModel = (
  runtimeModel: RuntimeModelInput,
): Model<Api> => {
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
    cost: runtimeModel.cost ?? catalogModel?.cost ?? {
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
