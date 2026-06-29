import type {
  CollaborationStepCondition,
  CollaborationStepType,
} from "./step.js";

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

export type CollaborationExecutionState = {
  input: unknown;
  output: Record<string, unknown>;
  stepResultById: Map<string, CollaborationStepResult>;
  skippedStepById: Map<string, CollaborationSkippedStepResult>;
};

export type CollaborationRunResult = {
  workflowRunId: string;
  executorId?: string;
  steps: CollaborationStepResult[];
  skippedSteps?: CollaborationSkippedStepResult[];
  output?: unknown;
};
