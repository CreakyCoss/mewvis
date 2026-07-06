import type { AgentRuntimeResources } from "../agent/index.js";
import type { RuntimeModelInput } from "../model.js";

export type CollaborationStepType = "agent" | "dispatch" | "transform" | "condition" | "router";

export type CollaborationBuiltinStepCondition = {
  ref: string;
  equals?: unknown;
  notEquals?: unknown;
  exists?: boolean;
  truthy?: boolean;
  includes?: unknown;
};

export type CollaborationNamedStepCondition = {
  condition: string;
  input?: unknown;
  invert?: boolean;
};

export type CollaborationStepCondition = CollaborationBuiltinStepCondition | CollaborationNamedStepCondition;

export type CollaborationBaseWorkflowStep = {
  id: string;
  type: CollaborationStepType;
  dependsOn?: string[];
  when?: CollaborationStepCondition | null;
  label?: string | null;
  outputKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CollaborationAgentWorkflowStep = CollaborationBaseWorkflowStep & {
  type: "agent";
  agentRoleId: string;
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
};

export type CollaborationDispatchMode = "serial" | "parallel";

export type CollaborationDispatchWorkflowStep = CollaborationBaseWorkflowStep & {
  type: "dispatch";
  input?: unknown;
  mode?: CollaborationDispatchMode | null;
};

export type CollaborationTransformWorkflowStep = CollaborationBaseWorkflowStep & {
  type: "transform";
  transform: string;
  input?: unknown;
};

export type CollaborationConditionWorkflowStep = CollaborationBaseWorkflowStep & {
  type: "condition";
  condition: string;
  input?: unknown;
};

export type CollaborationRouterWorkflowStep = CollaborationBaseWorkflowStep & {
  type: "router";
  router: string;
  input?: unknown;
  routes?: Record<string, string>;
  fallbackRoute?: string | null;
};

export type CollaborationWorkflowStep =
  | CollaborationAgentWorkflowStep
  | CollaborationDispatchWorkflowStep
  | CollaborationTransformWorkflowStep
  | CollaborationConditionWorkflowStep
  | CollaborationRouterWorkflowStep;

export type CollaborationAgentRole = {
  id: string;
  label: string;
  systemPrompt?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
  resources?: AgentRuntimeResources | null;
};

export type CollaborationWorkflowExecutionMode = "serial" | "parallel";

export type CollaborationWorkflowDefinition = {
  id: string;
  label?: string | null;
  version?: string | null;
  executionMode?: CollaborationWorkflowExecutionMode | null;
  maxSteps?: number | null;
  steps?: readonly CollaborationWorkflowStep[];
  metadata?: Record<string, unknown> | null;
};

export type CollaborationRunInput = {
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir?: string | null;
  workflow: CollaborationWorkflowDefinition;
  agents: readonly CollaborationAgentRole[];
  resources?: AgentRuntimeResources | null;
  input?: unknown;
};

export type CollaborationModeId = "supervisor.dispatch-loop" | "producer.review-rewrite-loop" | (string & {});

export type CollaborationParticipantKind = "supervisor" | "worker" | "producer" | "reviewer" | "evaluator";

export type CollaborationModeParticipant = {
  id: string;
  kind: CollaborationParticipantKind;
  label?: string | null;
  systemPrompt?: string | null;
  instruction?: string | null;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
  resources?: AgentRuntimeResources | null;
  capabilities?: string[];
  metadata?: Record<string, unknown> | null;
};

export type CollaborationModeRunInput = {
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir?: string | null;
  mode: CollaborationModeId;
  participants: readonly CollaborationModeParticipant[];
  context?: unknown;
  options?: Record<string, unknown> | null;
  resources?: AgentRuntimeResources | null;
};

export type CollaborationModeSummary = {
  id: CollaborationModeId;
  label: string;
  version: string;
};
