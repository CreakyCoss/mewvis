export interface ProviderModel {
  id: string;
  providerId: string;
  modelId: string;
  modelName: string;
  isEnabled: boolean;
  isOneMillionContext: boolean;
  thinking: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface LlmProvider {
  id: string;
  name: string;
  provider: string;
  apiFormat: string;
  apiKey: string | null;
  apiEndpoint: string | null;
  isDefault: boolean;
  models: ProviderModel[];
  createdAt: number;
  updatedAt: number;
}

export interface AiAgent {
  id: string;
  name: string;
  avatar: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}
