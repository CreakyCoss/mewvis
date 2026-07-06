import type { CollaborationStepCondition, CollaborationStepType } from "./workflow.js";

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
  steps: CollaborationStepResult[];
  skippedSteps?: CollaborationSkippedStepResult[];
  output?: unknown;
};
