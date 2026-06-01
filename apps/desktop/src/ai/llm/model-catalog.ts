import { MODEL_CATALOG } from "./models.generated";
import type { LlmProvider, ProviderModel } from "./types";

export type ModelCatalogConfig = {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input: Array<"text" | "image">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: unknown;
};

export type ModelCatalog = Record<string, Record<string, ModelCatalogConfig>>;

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

export const modelCatalog = MODEL_CATALOG as ModelCatalog;

export const getCatalogProviders = () => Object.keys(modelCatalog);

export const getCatalogModels = (vendor: string) => {
  return Object.values(modelCatalog[vendor] ?? {});
};

export const getCatalogModel = (
  vendor: string,
  modelId: string,
): ModelCatalogConfig | undefined => {
  return modelCatalog[vendor]?.[modelId];
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
