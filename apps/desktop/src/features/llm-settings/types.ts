export type ProviderModel = {
  id: string;
  providerId: string;
  modelId: string;
  modelName: string;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type LlmProvider = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  models: ProviderModel[];
};

export type LlmSettings = {
  providers: LlmProvider[];
};

export type ProviderModelDraft = {
  id: string;
  modelId: string;
  modelName: string;
  isEnabled: boolean;
};

export type LlmProviderDraft = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  isDefault: boolean;
  models: ProviderModelDraft[];
};

export type LlmSettingsDraft = {
  providers: LlmProviderDraft[];
};
