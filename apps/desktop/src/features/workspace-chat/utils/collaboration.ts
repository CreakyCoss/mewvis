import type { CollaborationWorkflowProfile, CollaborationWorkflowStepProfile } from "@/features/agent-settings/types";
import type {
  ChatMessage,
  ChatMessageCollaboration,
  ConversationMessage,
} from "../types";
import type { CollaborationPhase } from "../page-types";

export type CollaborationPromptPhase = "draft" | "review" | "revise" | "custom";

export type CollaborationStepOutput = {
  step: CollaborationWorkflowStepProfile;
  messageId: string;
  text: string;
  thinking?: string;
  metadata: ChatMessageCollaboration;
};

export type CollaborationSupervisorOutput = {
  messageId: string;
  agentName: string;
  text: string;
  metadata: ChatMessageCollaboration;
};

export const promptPhaseForWorkflowStep = (
  step: CollaborationWorkflowStepProfile,
): CollaborationPromptPhase => (
  step.phase === "draft" || step.phase === "review" || step.phase === "revise"
    ? step.phase
    : "custom"
);

export const visiblePhaseForWorkflowStep = (
  step: CollaborationWorkflowStepProfile,
  index: number,
  total: number,
): CollaborationPhase => {
  if (step.phase === "draft") {
    return "drafting";
  }
  if (step.phase === "review") {
    return "reviewing";
  }
  if (step.phase === "revise") {
    return "revising";
  }

  if (index === 0) {
    return "drafting";
  }
  if (index === total - 1) {
    return "revising";
  }
  return "reviewing";
};

export const createCollaborationStepMetadata = ({
  runId,
  workflow,
  step,
  stepIndex,
  stepCount,
}: {
  runId: string;
  workflow: CollaborationWorkflowProfile;
  step: CollaborationWorkflowStepProfile;
  stepIndex: number;
  stepCount: number;
}): ChatMessageCollaboration => ({
  role: "step",
  runId,
  workflowId: workflow.id,
  workflowName: workflow.name,
  stepId: step.id,
  stepName: step.name,
  stepIndex,
  stepCount,
  phase: step.phase ?? "custom",
  agentId: step.agent.id,
  agentName: step.agent.name,
  agentAvatar: step.agent.avatar,
  providerName: step.agent.provider.name,
  modelName: step.agent.model.modelName,
});

export const createCollaborationSupervisorMetadata = ({
  runId,
  workflow,
}: {
  runId: string;
  workflow: CollaborationWorkflowProfile;
}): ChatMessageCollaboration => ({
  role: "supervisor",
  runId,
  workflowId: workflow.id,
  workflowName: workflow.name,
  stepId: "supervisor",
  stepName: "主控计划",
  stepIndex: 0,
  stepCount: workflow.steps.length,
  phase: "supervisor",
  agentId: workflow.writerAgent.id,
  agentName: workflow.writerAgent.name,
  agentAvatar: workflow.writerAgent.avatar,
  providerName: workflow.writerAgent.provider.name,
  modelName: workflow.writerAgent.model.modelName,
  planDecision: "not_required",
});

export const createCollaborationStepMessage = ({
  id,
  createdAt,
  metadata,
}: {
  id: string;
  createdAt: number;
  metadata: ChatMessageCollaboration;
}): ChatMessage => ({
  id,
  role: "assistant",
  mode: "collab",
  text: "",
  status: "streaming",
  createdAt,
  agentAvatar: metadata.agentAvatar,
  agentName: metadata.agentName,
  collaboration: metadata,
});

export const createCollaborationSupervisorMessage = ({
  id,
  createdAt,
  metadata,
}: {
  id: string;
  createdAt: number;
  metadata: ChatMessageCollaboration;
}): ChatMessage => ({
  id,
  role: "assistant",
  mode: "collab",
  text: "",
  status: "streaming",
  createdAt,
  agentAvatar: metadata.agentAvatar,
  agentName: `${metadata.agentName} · 主控`,
  collaboration: metadata,
});

export const renderCollaborationStepOutput = (
  step: CollaborationWorkflowStepProfile,
  stepText: string,
) => `## ${step.agent.name}: ${step.name}\n\n${stepText}`;

export const renderCollaborationSupervisorOutput = (
  agentName: string,
  text: string,
) => `## ${agentName}: 主控计划\n\n${text}`;

export const renderCollaborationPriorOutputs = (
  stepOutputs: CollaborationStepOutput[],
) => stepOutputs
  .map((output, index) => [
    `## 步骤 ${index + 1}: ${output.step.name}`,
    `角色: ${output.step.agent.name}`,
    output.text,
  ].join("\n"))
  .join("\n\n");

export const renderCollaborationTranscript = (
  stepOutputs: CollaborationStepOutput[],
) => stepOutputs
  .map((output) => renderCollaborationStepOutput(output.step, output.text))
  .join("\n\n");

export const collaborationMessageLabel = (metadata: ChatMessageCollaboration) =>
  metadata.role === "supervisor"
    ? "主控 · 流程计划"
    : `步骤 ${metadata.stepIndex}/${metadata.stepCount} · ${metadata.stepName}`;

export const collaborationMessageLoadingText = (metadata: ChatMessageCollaboration) =>
  metadata.role === "supervisor"
    ? `${metadata.agentName} 正在规划流程`
    : `${metadata.agentName} 正在${metadata.stepName}`;

export const collaborationConversationContentFromMessage = (message: ChatMessage) => {
  if (!message.collaboration) {
    return message.text;
  }

  if (message.collaboration.role === "supervisor") {
    return renderCollaborationSupervisorOutput(message.collaboration.agentName, message.text);
  }

  return [
    `## ${message.collaboration.agentName}: ${message.collaboration.stepName}`,
    "",
    message.text,
  ].join("\n");
};

export const createCollaborationConversationMessage = (
  output: CollaborationStepOutput,
): ConversationMessage => ({
  id: output.messageId,
  role: "assistant",
  content: renderCollaborationStepOutput(output.step, output.text),
  timestamp: Date.now(),
  metadata: {
    collaboration: output.metadata,
  },
});

export const createCollaborationSupervisorConversationMessage = (
  output: CollaborationSupervisorOutput,
): ConversationMessage => ({
  id: output.messageId,
  role: "assistant",
  content: renderCollaborationSupervisorOutput(output.agentName, output.text),
  timestamp: Date.now(),
  metadata: {
    collaboration: output.metadata,
  },
});
