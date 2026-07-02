import type {
  CollaborationSkippedStepResult,
  CollaborationStepResult,
} from "../../../../../protocol/index.js";

export type CollaborationExecutionState = {
  input: unknown;
  output: Record<string, unknown>;
  stepResultById: Map<string, CollaborationStepResult>;
  skippedStepById: Map<string, CollaborationSkippedStepResult>;
};
