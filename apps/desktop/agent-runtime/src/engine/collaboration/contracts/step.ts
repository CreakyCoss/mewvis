import type {
  RuntimeModelInput,
} from "../../agent/contracts/model.js";
import type {
  BridgeRuntimeResources,
} from "../../agent/contracts/protocol.js";
import type {
  AgentToolName,
} from "../../agent/tools/definitions.js";

export type CollaborationStepType =
  | "agent"
  | "dispatch"
  | "transform"
  | "condition"
  | "router";

export type CollaborationTemplateRef = {
  $ref: string;
};

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

export type CollaborationStepCondition =
  | CollaborationBuiltinStepCondition
  | CollaborationNamedStepCondition;

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
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
  resources?: BridgeRuntimeResources | null;
  maxRetries?: number | null;
};

export type CollaborationDispatchMode = "serial" | "parallel";

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
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
  resources?: BridgeRuntimeResources | null;
  maxRetries?: number | null;
  metadata?: Record<string, unknown> | null;
};

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
