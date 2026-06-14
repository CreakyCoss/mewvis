export type ApiFormat =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-codex-responses"
  | "openai-responses"
  | "azure-openai-responses"
  | "google-generative-ai"
  | "openrouter";

export type ModelInputModality = "text" | "image";

export type CatalogProviderApi = {
  apiFormat: ApiFormat;
  apiEndpoint?: string;
};

export type CatalogProviderConfig = {
  websiteUrl: string;
  models?: string[];
  apis: CatalogProviderApi[];
};

type CatalogModelBase<Input> = {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input: Input;
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

export type RawCatalogModel = CatalogModelBase<
  readonly ModelInputModality[]
>;

export type CatalogModel = CatalogModelBase<ModelInputModality[]>;

export type CatalogProvider = {
  models: Record<string, CatalogModel>;
  websiteUrl: string;
  apis: CatalogProviderApi[];
};

export type RawCatalogProvider = {
  /** Original provider API URL from models.dev, kept as reference metadata. */
  api: string;
  models: Record<string, RawCatalogModel>;
};

export type RawModelCatalog = Record<string, RawCatalogProvider>;

export type ModelCatalog = Record<string, CatalogProvider>;
