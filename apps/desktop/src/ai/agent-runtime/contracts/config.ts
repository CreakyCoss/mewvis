export type AgentRuntimeThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type AgentRuntimeModelInput = {
  provider: string;
  apiFormat: string;
  apiKey?: string | null;
  catalogModelId: string;
  modelId: string;
  apiEndpoint?: string | null;
  reasoning?: boolean;
  thinkingLevel?: AgentRuntimeThinkingLevel | null;
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
};
