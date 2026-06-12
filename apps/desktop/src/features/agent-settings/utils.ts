import { defaultAgentAvatar } from "@/assets/agent-avatars";
import {
  findDefaultRuntimeModel,
  findRuntimeModelByLegacyIds,
  type RuntimeModelOption,
} from "@/features/llm-settings/runtime-models";
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

export const DEFAULT_COLLABORATION_WORKFLOW_ID = "default-collaboration-workflow";

export const defaultCollaborationWorkflowDescription =
  "写作角色起草，审查角色提意见，再由写作角色修订定稿。";

const createWorkflowStepId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `workflow-step-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const resolveAgentProfiles = (
  agents: AiAgent[],
  runtimeModels: RuntimeModelOption[],
): AgentProfile[] => {
  return agents.flatMap((agent) => {
    const runtimeModel = findRuntimeModelByLegacyIds(
      runtimeModels,
      agent.providerId,
      agent.modelId,
    );
    if (!runtimeModel) {
      return [];
    }

    return [{
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      description: agent.description,
      runtimeModel,
      isDefault: false,
    }];
  });
};

export const resolveCollaborationWorkflowProfiles = (
  workflows: CollaborationWorkflow[],
  agentProfiles: AgentProfile[],
): CollaborationWorkflowProfile[] => {
  const customWorkflows = workflows.flatMap((workflow) => {
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

  if (customWorkflows.length > 0 || agentProfiles.length === 0) {
    return customWorkflows;
  }

  const writerAgent = agentProfiles[0];
  const reviewerAgent = agentProfiles.find((agent) => agent.id !== writerAgent.id) ?? writerAgent;
  const steps = createDefaultCollaborationWorkflowSteps(writerAgent.id, reviewerAgent.id)
    .map((step) => ({
      ...step,
      agent: step.agentId === reviewerAgent.id ? reviewerAgent : writerAgent,
    }));

  return [{
    id: DEFAULT_COLLABORATION_WORKFLOW_ID,
    name: "默认协作流程",
    description: defaultCollaborationWorkflowDescription,
    writerAgent,
    reviewerAgent,
    draftInstruction: null,
    reviewInstruction: null,
    reviseInstruction: null,
    steps,
    isDefault: true,
  }];
};

export const createDefaultCollaborationWorkflowSteps = (
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

export const createAgentDraft = (
  runtimeModels: RuntimeModelOption[],
): SaveAiAgentInput => {
  const runtimeModel = findDefaultRuntimeModel(runtimeModels);

  return {
    id: null,
    name: "",
    avatar: defaultAgentAvatar.id,
    description: "",
    providerId: runtimeModel?.provider.id ?? "",
    modelId: runtimeModel?.modelId ?? "",
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
      ? createDefaultCollaborationWorkflowSteps(writerAgent.id, reviewerAgent?.id ?? writerAgent.id)
      : [],
  };
};
