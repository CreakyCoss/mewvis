import type { CollaborationSkippedStep, CollaborationStepResult } from "../../../../../protocol/wire.js";

export type CollaborationExecutionState = {
  input: unknown;
  output: Record<string, unknown>;
  stepResultById: Map<string, CollaborationStepResult>;
  skippedStepById: Map<string, CollaborationSkippedStep>;
};
