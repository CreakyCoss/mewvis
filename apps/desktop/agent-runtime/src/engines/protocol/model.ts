export type RuntimeModelInputModality = "text" | "image";

export type RuntimeApiFormat =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-codex-responses"
  | "openai-responses"
  | "azure-openai-responses"
  | "google-generative-ai"
  | "openrouter";

export type RuntimeThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type RuntimeModelInput = {
  provider: string;
  apiFormat: RuntimeApiFormat;
  apiKey?: string | null;
  catalogModelId: string;
  modelId: string;
  apiEndpoint?: string | null;
  reasoning?: boolean;
  thinkingLevel?: RuntimeThinkingLevel | null;
  thinkingLevelMap?: Record<string, string | null>;
  input?: RuntimeModelInputModality[];
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
};

export type RuntimeModelCatalogApi = {
  apiFormat: RuntimeApiFormat;
  apiEndpoint?: string;
};

export type RuntimeModelSummary = {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input: RuntimeModelInputModality[];
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

export type RuntimeModelProviderSummary = {
  models: Record<string, RuntimeModelSummary>;
  websiteUrl: string;
  apis: RuntimeModelCatalogApi[];
};

export type RuntimeModelCatalog = Record<string, RuntimeModelProviderSummary>;

export type CatalogModel = RuntimeModelSummary;
