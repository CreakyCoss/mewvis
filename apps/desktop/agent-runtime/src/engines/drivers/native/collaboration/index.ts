import {
  executeCollaborationModeCommand,
  executeCollaborationRunCommand,
  listCollaborationModes,
  type CollaborationCommandExecutionOptions,
} from "./commands/execution.js";
import type {
  CollaborationRunInput,
  CollaborationRunResult,
} from "../../../protocol/index.js";
import type {
  CollaborationModeRunInput,
  CollaborationModeRunResult,
  CollaborationModeSummary,
} from "./modes/index.js";
import type {
  CollaborationRunContext,
} from "./runtimes/types.js";

type CollaborationEngineOptions = CollaborationCommandExecutionOptions;

export type CollaborationEngine = {
  run(
    input: CollaborationRunInput,
    context?: CollaborationRunContext,
  ): Promise<CollaborationRunResult>;
  runMode(
    input: CollaborationModeRunInput,
    context?: CollaborationRunContext,
  ): Promise<CollaborationModeRunResult>;
  listModes(): CollaborationModeSummary[];
};

export const createCollaborationEngine = (
  options: CollaborationEngineOptions,
): CollaborationEngine => ({
  run: (input, context) =>
    executeCollaborationRunCommand(input, context, options),
  runMode: (input, context) =>
    executeCollaborationModeCommand(input, context, options),
  listModes: () => listCollaborationModes(options),
});
