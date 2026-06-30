import type {
  AgentEvent,
  AgentRuntimeResources,
} from "./agent.js";
import type { RuntimeModelInput } from "../models/types.js";

export enum CollaborationEventType {
  WorkflowStarted = "workflow_started",
  StepStarted = "step_started",
  AgentEvent = "agent_event",
  StepDone = "step_done",
  StepSkipped = "step_skipped",
  WorkflowDone = "workflow_done",
  Error = "error",
}

export type CollaborationStepType =
  | "agent"
  | "dispatch"
  | "transform"
  | "condition"
  | "router";

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
  agentId?: string | null;
  systemPrompt?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
  resources?: AgentRuntimeResources | null;
};

export type CollaborationWorkflowExecutionMode = "serial" | "parallel";

export type CollaborationExecutorId = "native" | "langgraph" | (string & {});

export type CollaborationWorkflowDefinition = {
  id: string;
  label?: string | null;
  version?: string | null;
  executor?: CollaborationExecutorId | null;
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

export type CollaborationModeId =
  | "supervisor.dispatch-loop"
  | "producer.review-rewrite-loop"
  | (string & {});

export type CollaborationParticipantKind =
  | "supervisor"
  | "worker"
  | "producer"
  | "reviewer"
  | "evaluator";

export type CollaborationModeParticipant = {
  id: string;
  kind: CollaborationParticipantKind;
  label?: string | null;
  agentId?: string | null;
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
  executor?: CollaborationExecutorId | null;
};

export type CollaborationModeSummary = {
  id: CollaborationModeId;
  label: string;
  version: string;
};

export type CollaborationStepResult = {
  stepId: string;
  stepType: CollaborationStepType;
  outputKey: string;
  output: unknown;
  text: string;
  agentRoleId?: string;
  agentTaskId?: string;
  route?: string | null;
};

export type CollaborationSkippedStepResult = {
  stepId: string;
  reason: string;
  condition?: CollaborationStepCondition | null;
};

export type CollaborationRunResult = {
  workflowRunId: string;
  executorId?: string;
  steps: CollaborationStepResult[];
  skippedSteps?: CollaborationSkippedStepResult[];
  output?: unknown;
};

export type CollaborationEvent =
  | {
    type: CollaborationEventType.WorkflowStarted;
    workflowRunId: string;
    workflowId: string;
    executorId: string;
  }
  | {
    type: CollaborationEventType.StepStarted;
    workflowRunId: string;
    stepId: string;
    stepType: CollaborationStepType;
    agentRoleId?: string;
    agentTaskId?: string;
  }
  | {
    type: CollaborationEventType.AgentEvent;
    workflowRunId: string;
    stepId: string;
    agentRoleId: string;
    agentTaskId: string;
    event: AgentEvent;
  }
  | {
    type: CollaborationEventType.StepDone;
    workflowRunId: string;
    step: CollaborationStepResult;
  }
  | {
    type: CollaborationEventType.StepSkipped;
    workflowRunId: string;
    step: CollaborationSkippedStepResult;
  }
  | {
    type: CollaborationEventType.WorkflowDone;
    workflowRunId: string;
    result: CollaborationRunResult;
  }
  | {
    type: CollaborationEventType.Error;
    workflowRunId: string;
    stepId?: string;
    agentRoleId?: string;
    agentTaskId?: string;
    message: string;
  };
