import { MODEL_CATALOG } from "./models.original.js";

export { MODEL_CATALOG };

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