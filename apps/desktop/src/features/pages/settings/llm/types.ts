import type { RuntimeApiFormat } from "@/agent-client/types";

export type ProviderModel = {
  id: string;
  providerId: string;
  modelId: string;
  modelName: string;
  isEnabled: boolean;
  isOneMillionContext: boolean;
  createdAt: number;
  updatedAt: number;
};

export type LlmProvider = {
  id: string;
  name: string;
  provider: string;
  apiFormat: RuntimeApiFormat;
  apiKey?: string | null;
  apiEndpoint?: string | null;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  models: ProviderModel[];
};

export type LlmSettings = {
  providers: LlmProvider[];
};

export type ProviderModelConfig = Omit<ProviderModel, "createdAt" | "updatedAt" | "providerId">;

export type LlmProviderConfig = Omit<LlmProvider, "apiEndpoint" | "apiKey" | "createdAt" | "updatedAt" | "models"> & {
  apiKey: string;
  apiEndpoint: string;
  models: ProviderModelConfig[];
};

export type LlmSettingsConfig = {
  providers: LlmProviderConfig[];
};
