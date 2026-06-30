import type {
  CollaborationModeId,
  CollaborationModeRunInput,
  CollaborationModeSummary,
  CollaborationRunInput,
  CollaborationRunResult,
} from "../../../protocol/index.js";

export type CollaborationModeRunResult = CollaborationRunResult & {
  mode: CollaborationModeId;
};


export type CollaborationModeDefinition = {
  id: CollaborationModeId;
  label: string;
  version: string;
  build(input: CollaborationModeRunInput): CollaborationRunInput;
};
