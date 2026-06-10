export {
  MODEL_CATALOG,
  modelCatalog,
  getCatalogProviders,
  getCatalogModels,
  getCatalogModel,
  type ModelCatalogConfig,
  type ModelCatalog,
} from "@agent-bridge/llm/model-catalog";

import { getCatalogModel } from "@agent-bridge/llm/model-catalog";
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

export const createRuntimeModelConfig = (
  provider: Pick<LlmProvider, "vendor" | "provider" | "baseUrl">,
  model: ProviderModel,
): RuntimeModelConfig => {
  const configuredModel = getCatalogModel(provider.vendor, model.modelId);

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
    baseUrl: provider.baseUrl ?? configuredModel.baseUrl,
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
