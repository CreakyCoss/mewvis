import type {
  AgentRunCommand,
  AgentRunResult,
  EmitAgentEvent,
} from "../../agent/runtimes/types.js";
import type {
  CollaborationHandlerRegistry,
  EmitCollaborationEvent,
} from "./handler.js";
import type {
  CollaborationExecutorId,
  CollaborationModeRunInput,
  CollaborationModeSummary,
  CollaborationRunResult,
  CollaborationRunInput,
} from "../../../protocol/index.js";
import type {
  CollaborationModeRunResult,
} from "../modes/contracts.js";

export type {
  EmitCollaborationEvent,
} from "./handler.js";

export type CollaborationRunContext = {
  emit?: EmitCollaborationEvent;
};

export type RunAgentForCollaborationContext = {
  emit: EmitAgentEvent;
};

export type RunAgentForCollaboration = (
  command: AgentRunCommand,
  context: RunAgentForCollaborationContext,
) => Promise<AgentRunResult>;

export type CollaborationExecutorRunInput = {
  input: CollaborationRunInput;
  context: CollaborationRunContext;
  workflowRunId: string;
  executorId: string;
  emit: EmitCollaborationEvent;
  runAgent: RunAgentForCollaboration;
  handlerRegistry: CollaborationHandlerRegistry;
};

export type CollaborationExecutor = {
  id: CollaborationExecutorId;
  run(input: CollaborationExecutorRunInput): Promise<CollaborationRunResult>;
};

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
