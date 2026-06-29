import type {
  AgentRunCommand,
  AgentRunResult,
  EmitBridgeEvent,
} from "../../agent/runtimes/types.js";
import type {
  CollaborationHandlerRegistry,
} from "./handler.js";
import type {
  EmitCollaborationEvent,
} from "./event.js";
import type {
  CollaborationRunResult,
} from "./state.js";
import type {
  CollaborationExecutorId,
  CollaborationRunInput,
} from "./workflow.js";
import type {
  CollaborationModeRunInput,
  CollaborationModeRunResult,
  CollaborationModeSummary,
} from "../modes/contracts.js";

export type CollaborationRunContext = {
  emit?: EmitCollaborationEvent;
};

export type RunAgentForCollaborationContext = {
  emit: EmitBridgeEvent;
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
