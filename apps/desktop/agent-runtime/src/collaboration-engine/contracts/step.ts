import type {
  RuntimeModelInput,
} from "../../agent-engine/contracts/model.js";
import type {
  BridgeRuntimeResources,
} from "../../agent-engine/contracts/protocol.js";
import type {
  AgentToolName,
} from "../../agent-engine/tools/definitions.js";

export type CollaborationStepType =
  | "agent"
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
  | CollaborationTransformWorkflowStep
  | CollaborationConditionWorkflowStep
  | CollaborationRouterWorkflowStep;
