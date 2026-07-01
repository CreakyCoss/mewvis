import type {
  AgentRuntimeResources,
  CollaborationAgentWorkflowStep,
  RuntimeModelInput,
} from "../../../../protocol/index.js";

export type CollaborationTemplateRef = {
  $ref: string;
};

export type CollaborationAgentInvocation = {
  id?: string | null;
  label?: string | null;
  agentRoleId: string;
  outputKey?: string | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
  resources?: AgentRuntimeResources | null;
  maxRetries?: number | null;
  metadata?: Record<string, unknown> | null;
};
