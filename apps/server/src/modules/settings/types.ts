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

export interface WorkflowStep {
  id: string;
  name: string;
  agentId: string;
  instruction: string | null;
  phase: string | null;
}

export interface CollaborationWorkflow {
  id: string;
  name: string;
  description: string | null;
  writerAgentId: string;
  reviewerAgentId: string;
  draftInstruction: string | null;
  reviewInstruction: string | null;
  reviseInstruction: string | null;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}
