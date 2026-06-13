export type RuntimeModelInputModality = "text" | "image";

export type RuntimeThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type RuntimeModelInput = {
  provider: string;
  apiFormat: string;
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
