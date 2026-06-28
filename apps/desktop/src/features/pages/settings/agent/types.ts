export type AiAgent = {
  id: string;
  name: string;
  avatar: string;
  description: string | null;
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

export type AgentRuntimeDefaultCollaborationExecutorId = "native" | "langgraph";

export type AgentRuntimeSettings = {
  defaultCollaborationExecutorId: AgentRuntimeDefaultCollaborationExecutorId | null;
};

export type AiAgentSettings = {
  agents: AiAgent[];
  collaborationWorkflows: CollaborationWorkflow[];
  runtime: AgentRuntimeSettings;
};

export type SaveAiAgentInput = {
  id?: string | null;
  name: string;
  avatar: string;
  description?: string | null;
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

export type SaveAgentRuntimeSettingsInput = {
  defaultCollaborationExecutorId?: AgentRuntimeDefaultCollaborationExecutorId | null;
};

export type AgentProfile = {
  id: string;
  name: string;
  avatar: string;
  description: string | null;
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
