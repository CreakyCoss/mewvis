import type { RuntimeModelConfig } from "@/features/llm-settings/model-catalog";

export type LlmRuntimeModelConfig = RuntimeModelConfig;

export type LlmProviderConfig = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  model: LlmRuntimeModelConfig;
};

export type LlmChatMessage = {
  role: string;
  content: string;
};

export type LlmChatOptions = {
  systemPrompt: string;
  messages: LlmChatMessage[];
};

export type LlmChatResult = {
  message: unknown;
  text: string;
  thinking?: string | null;
};

export interface LlmRuntimeAdapter {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly model: LlmRuntimeModelConfig;
  chat(options: LlmChatOptions): Promise<LlmChatResult>;
}
