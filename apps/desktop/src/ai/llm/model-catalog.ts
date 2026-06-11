export {
  getCatalogProviders,
  getCatalogModels,
  type RuntimeModelCatalogEntry,
} from "@agent-bridge/llm";

import { getCatalogModel } from "@agent-bridge/llm";
import type { ApiFormat } from "@agent-bridge/llm";
import type { LlmProvider, ProviderModel } from "./types";

export type RuntimeModelConfig = {
  id: string;
  modelId: string;
  modelName: string;
  baseUrl?: string;
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

const runtimeApiFormatForProvider = (provider: string): ApiFormat => {
  if (provider === "anthropic") {
    return "anthropic-messages";
  }

  if (provider === "google") {
    return "google-generative-ai";
  }

  return "openai-completions";
};

export const createRuntimeModelConfig = (
  provider: Pick<LlmProvider, "vendor" | "provider" | "baseUrl">,
  model: ProviderModel,
): RuntimeModelConfig => {
  const configuredModel = getCatalogModel(
    provider.vendor,
    model.modelId,
    runtimeApiFormatForProvider(provider.provider),
  );

  if (!configuredModel) {
    return {
      id: model.id,
      modelId: model.modelId,
      modelName: model.modelName,
      baseUrl: provider.baseUrl ?? undefined,
    };
  }

  return {
    id: model.id,
    modelId: model.modelId,
    modelName: model.modelName || configuredModel.name,
    baseUrl: provider.baseUrl ?? configuredModel.apiEndpoint,
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
