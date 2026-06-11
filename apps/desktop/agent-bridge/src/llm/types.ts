export type ApiFormat =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-codex-responses"
  | "openai-responses"
  | "azure-openai-responses"
  | "google-generative-ai";

export type ModelInputModality = "text" | "image";

export type ProviderRuntimeApi = {
  apiFormat: ApiFormat;
  apiEndpoint?: string;
};

export type ProviderRuntimeConfig = {
  websiteUrl: string;
  models?: string[];
  apis: ProviderRuntimeApi[];
};

export type RawModelCatalogEntry = {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input: readonly ModelInputModality[];
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

export type RuntimeModelCatalogEntry = Omit<RawModelCatalogEntry, "input"> & {
  input: ModelInputModality[];
  provider: string;
  websiteUrl: string;
  apiFormat: ApiFormat;
  apiEndpoint: string;
};

export type RawProviderCatalog = {
  /** Original provider API URL from models.dev, kept as reference metadata. */
  api: string;
  models: Record<string, RawModelCatalogEntry>;
};

export type RawModelCatalog = Record<string, RawProviderCatalog>;

export type ModelCatalog = Record<string, RuntimeModelCatalogEntry[]>;
