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
