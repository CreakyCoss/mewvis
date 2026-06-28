import type {
  AgentRunCommand,
  AgentRunResult,
  AgentRuntimeContext,
  AskUser,
} from "../../agent-engine/runtimes/types.js";
import type {
  CollaborationExtensionRegistry,
} from "./extension.js";
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

export type CollaborationRunContext = {
  askUser?: AskUser;
  emit?: EmitCollaborationEvent;
};

export type RunAgentForCollaboration = (
  command: AgentRunCommand,
  context: AgentRuntimeContext,
) => Promise<AgentRunResult>;

export type CollaborationExecutorRunInput = {
  input: CollaborationRunInput;
  context: CollaborationRunContext;
  workflowRunId: string;
  executorId: string;
  emit: EmitCollaborationEvent;
  runAgent: RunAgentForCollaboration;
  extensionRegistry: CollaborationExtensionRegistry;
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
};
