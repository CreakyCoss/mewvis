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

export interface AgentDefinition {
  id: string;
  name: string;
  avatar: string;
  summary: string;
  category: string;
  instructions: string;
  useCases: string[];
  starterPrompts: string[];
  skillKeys: string[];
  toolNames: string[];
  knowledgeCollectionIds: string[];
  templateId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** System-maintained configurations used to create agents; not themselves selectable chat agents. */
export type AgentTemplate = Omit<
  AgentDefinition,
  "templateId" | "createdAt" | "updatedAt"
> & {
  references: { name: string; url: string }[];
};
