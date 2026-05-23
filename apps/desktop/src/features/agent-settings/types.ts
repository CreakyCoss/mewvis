import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";

export type AiAgent = {
  id: string;
  name: string;
  avatar: string;
  description: string | null;
  providerId: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
};

export type AiAgentSettings = {
  agents: AiAgent[];
};

export type SaveAiAgentInput = {
  id?: string | null;
  name: string;
  avatar: string;
  description?: string | null;
  providerId: string;
  modelId: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  avatar: string;
  description: string | null;
  provider: LlmProvider;
  model: ProviderModel;
  isDefault: boolean;
};
