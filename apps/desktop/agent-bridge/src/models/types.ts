import type { RuntimeApiFormat } from "../contracts/model.js";

export type ModelInputModality = "text" | "image";

export type CatalogProviderApi = {
  apiFormat: RuntimeApiFormat;
  apiEndpoint?: string;
};

export type CatalogModel = {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input: ModelInputModality[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
};

export type CatalogProvider = {
  models: Record<string, CatalogModel>;
  websiteUrl: string;
  apis: CatalogProviderApi[];
};

export type ModelCatalog = Record<string, CatalogProvider>;
