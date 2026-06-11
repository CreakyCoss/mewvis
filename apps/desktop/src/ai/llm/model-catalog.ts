export {
  getCatalogProviders,
  getCatalogModels,
  type RuntimeModelCatalogEntry,
} from "@agent-bridge/llm";

import { getCatalogModel } from "@agent-bridge/llm";
import type { ApiFormat } from "@agent-bridge/llm";
import type { LlmProvider, ProviderModel } from "./types";

export type RuntimeModelInputConfig = {
  provider: string;
  apiFormat: string;
  apiKey?: string | null;
  catalogModelId: string;
  modelId: string;
  apiEndpoint?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: Array<"text" | "image">;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  compat?: unknown;
};

const apiFormats = new Set<ApiFormat>([
  "anthropic-messages",
  "openai-completions",
  "openai-responses",
  "google-generative-ai",
  "azure-openai-responses",
  "openai-codex-responses",
]);

const catalogApiFormatForProvider = (apiFormat: string): ApiFormat => {
  if (apiFormats.has(apiFormat as ApiFormat)) {
    return apiFormat as ApiFormat;
  }

  if (apiFormat === "anthropic" || apiFormat === "anthropic-messages") {
    return "anthropic-messages";
  }

  if (apiFormat === "google" || apiFormat === "google-generative-ai") {
    return "google-generative-ai";
  }

  return "openai-completions";
};

const oneMillionContextSuffix = "[1m]";

const resolveRuntimeModelId = (model: ProviderModel) => {
  const modelId = model.modelId;

  if (!model.isOneMillionContext || modelId.endsWith(oneMillionContextSuffix)) {
    return modelId;
  }

  return `${modelId}${oneMillionContextSuffix}`;
};

export const createRuntimeModelInputConfig = (
  provider: Pick<LlmProvider, "provider" | "apiFormat" | "apiKey" | "apiEndpoint">,
  model: ProviderModel,
): RuntimeModelInputConfig => {
  const apiFormat = catalogApiFormatForProvider(provider.apiFormat);
  const configuredModel = getCatalogModel(
    provider.provider,
    model.modelId,
    apiFormat,
  );

  if (!configuredModel) {
    return {
      provider: provider.provider,
      apiFormat: provider.apiFormat,
      apiKey: provider.apiKey,
      catalogModelId: model.modelId,
      modelId: resolveRuntimeModelId(model),
      apiEndpoint: provider.apiEndpoint ?? undefined,
    };
  }

  return {
    provider: provider.provider,
    apiFormat: provider.apiFormat,
    apiKey: provider.apiKey,
    catalogModelId: model.modelId,
    modelId: resolveRuntimeModelId(model),
    apiEndpoint: provider.apiEndpoint ?? configuredModel.apiEndpoint,
    reasoning: configuredModel.reasoning,
    thinkingLevelMap: configuredModel.thinkingLevelMap,
    input: configuredModel.input,
    cost: configuredModel.cost,
    contextWindow: configuredModel.contextWindow,
    maxTokens: configuredModel.maxTokens,
    headers: configuredModel.headers,
    compat: configuredModel.compat,
  };
};
