import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";

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

export type CollaborationWorkflowStep = {
  id: string;
  name: string;
  agentId: string;
  instruction: string | null;
  phase: string | null;
};

export type CollaborationWorkflow = {
  id: string;
  name: string;
  description: string | null;
  writerAgentId: string;
  reviewerAgentId: string;
  draftInstruction: string | null;
  reviewInstruction: string | null;
  reviseInstruction: string | null;
  steps: CollaborationWorkflowStep[];
  createdAt: number;
  updatedAt: number;
};

export type AiAgentSettings = {
  agents: AiAgent[];
  collaborationWorkflows: CollaborationWorkflow[];
};

export type SaveAiAgentInput = {
  id?: string | null;
  name: string;
  avatar: string;
  description?: string | null;
  providerId: string;
  modelId: string;
};

export type SaveCollaborationWorkflowInput = {
  id?: string | null;
  name: string;
  description?: string | null;
  writerAgentId: string;
  reviewerAgentId: string;
  draftInstruction?: string | null;
  reviewInstruction?: string | null;
  reviseInstruction?: string | null;
  steps?: Array<{
    id?: string | null;
    name: string;
    agentId: string;
    instruction?: string | null;
    phase?: string | null;
  }>;
};

export type AgentProfile = {
  id: string;
  name: string;
  avatar: string;
  description: string | null;
  runtimeModel: RuntimeModelOption;
  isDefault: boolean;
};

export type CollaborationWorkflowProfile = {
  id: string;
  name: string;
  description: string | null;
  writerAgent: AgentProfile;
  reviewerAgent: AgentProfile;
  draftInstruction: string | null;
  reviewInstruction: string | null;
  reviseInstruction: string | null;
  steps: CollaborationWorkflowStepProfile[];
  isDefault: boolean;
};

export type CollaborationWorkflowStepProfile = {
  id: string;
  name: string;
  agent: AgentProfile;
  instruction: string | null;
  phase: string | null;
};
