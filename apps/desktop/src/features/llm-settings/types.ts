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
  apiFormat: string;
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

export type ProviderModelDraft = {
  id: string;
  modelId: string;
  modelName: string;
  isEnabled: boolean;
  isOneMillionContext: boolean;
};

export type LlmProviderDraft = {
  id: string;
  name: string;
  provider: string;
  apiFormat: string;
  apiKey: string;
  apiEndpoint: string;
  isDefault: boolean;
  models: ProviderModelDraft[];
};

export type LlmSettingsDraft = {
  providers: LlmProviderDraft[];
};
