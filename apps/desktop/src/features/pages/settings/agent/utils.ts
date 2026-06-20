import { defaultAgentAvatar } from "@/assets/agent-avatars";
import type {
  AgentProfile,
  AiAgent,
  CollaborationWorkflow,
  CollaborationWorkflowProfile,
  CollaborationWorkflowStep,
  CollaborationWorkflowStepProfile,
  SaveAiAgentInput,
  SaveCollaborationWorkflowInput,
} from "./types";

const createWorkflowStepId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `workflow-step-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const resolveAgentProfiles = (
  agents: AiAgent[],
): AgentProfile[] =>
  agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    description: agent.description,
    isDefault: false,
  }));

export const resolveCollaborationWorkflowProfiles = (
  workflows: CollaborationWorkflow[],
  agentProfiles: AgentProfile[],
): CollaborationWorkflowProfile[] =>
  workflows.flatMap((workflow) => {
    const steps = resolveCollaborationWorkflowStepProfiles(workflow.steps, agentProfiles);
    if (steps.length === 0) {
      return [];
    }
    const writerAgent = steps[0].agent;
    const reviewerAgent = steps.find((step) => step.agent.id !== writerAgent.id)?.agent
      ?? steps[1]?.agent
      ?? writerAgent;

    return [{
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      writerAgent,
      reviewerAgent,
      draftInstruction: workflow.draftInstruction,
      reviewInstruction: workflow.reviewInstruction,
      reviseInstruction: workflow.reviseInstruction,
      steps,
      isDefault: false,
    }];
  });

export const createInitialCollaborationWorkflowSteps = (
  writerAgentId: string,
  reviewerAgentId: string,
): CollaborationWorkflowStep[] => [
  {
    id: createWorkflowStepId(),
    name: "起草",
    agentId: writerAgentId,
    instruction: null,
    phase: "draft",
  },
  {
    id: createWorkflowStepId(),
    name: "审查",
    agentId: reviewerAgentId || writerAgentId,
    instruction: null,
    phase: "review",
  },
  {
    id: createWorkflowStepId(),
    name: "修订",
    agentId: writerAgentId,
    instruction: null,
    phase: "revise",
  },
];

export const resolveCollaborationWorkflowStepProfiles = (
  steps: CollaborationWorkflowStep[],
  agentProfiles: AgentProfile[],
): CollaborationWorkflowStepProfile[] =>
  steps.flatMap((step) => {
    const agent = agentProfiles.find((item) => item.id === step.agentId);
    if (!agent) {
      return [];
    }

    return [{
      id: step.id,
      name: step.name,
      agent,
      instruction: step.instruction,
      phase: step.phase,
    }];
  });

export const createAgentDraft = (): SaveAiAgentInput => {
  return {
    id: null,
    name: "",
    avatar: defaultAgentAvatar.id,
    description: "",
  };
};

export const agentToDraft = (
  agent: AiAgent,
): SaveAiAgentInput => {
  return {
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    description: agent.description ?? "",
  };
};

export const createCollaborationWorkflowDraft = (
  agentProfiles: AgentProfile[],
): SaveCollaborationWorkflowInput => {
  const writerAgent = agentProfiles[0];
  const reviewerAgent = agentProfiles.find((agent) => agent.id !== writerAgent?.id)
    ?? writerAgent;

  return {
    id: null,
    name: "",
    description: "",
    writerAgentId: writerAgent?.id ?? "",
    reviewerAgentId: reviewerAgent?.id ?? "",
    draftInstruction: "",
    reviewInstruction: "",
    reviseInstruction: "",
    steps: writerAgent
      ? createInitialCollaborationWorkflowSteps(writerAgent.id, reviewerAgent?.id ?? writerAgent.id)
      : [],
  };
};
