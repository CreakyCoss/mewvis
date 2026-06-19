import { defaultAgentAvatar } from "@/assets/agent-avatars";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
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

const findAgentRuntimeModel = (
  runtimeModels: RuntimeModelOption[],
  agent: Pick<AiAgent, "providerId" | "modelId">,
) => {
  const runtimeModel = runtimeModels.find(
    (model) => model.id === agent.modelId,
  );

  return runtimeModel?.provider.id === agent.providerId ? runtimeModel : null;
};

export const resolveAgentProfiles = (
  agents: AiAgent[],
  runtimeModels: RuntimeModelOption[],
): AgentProfile[] => {
  return agents.flatMap((agent) => {
    const runtimeModel = findAgentRuntimeModel(runtimeModels, agent);
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

export const createAgentDraft = (
  runtimeModels: RuntimeModelOption[],
): SaveAiAgentInput => {
  const runtimeModel = runtimeModels[0] ?? null;

  return {
    id: null,
    name: "",
    avatar: defaultAgentAvatar.id,
    description: "",
    providerId: runtimeModel?.provider.id ?? "",
    modelId: runtimeModel?.id ?? "",
  };
};

export const agentToDraft = (
  agent: AiAgent,
  runtimeModels: RuntimeModelOption[],
): SaveAiAgentInput => {
  const runtimeModel = findAgentRuntimeModel(runtimeModels, agent);

  return {
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    description: agent.description ?? "",
    providerId: runtimeModel?.provider.id ?? agent.providerId,
    modelId: runtimeModel?.id ?? agent.modelId,
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
