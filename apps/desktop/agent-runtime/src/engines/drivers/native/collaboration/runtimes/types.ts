import type {
  AgentRunCommand,
  AgentRunResult,
  EmitAgentEvent,
} from "../../agent/runtimes/types.js";
import type {
  CollaborationHandlerRegistry,
  EmitCollaborationEvent,
} from "../handlers/types.js";
import type {
  CollaborationRunResult,
  CollaborationRunInput,
} from "../../../../protocol/index.js";

export type {
  EmitCollaborationEvent,
} from "../handlers/types.js";

export type CollaborationRuntimeId = "native" | "langgraph" | (string & {});

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

export type CollaborationRuntimeRunInput = {
  input: CollaborationRunInput;
  context: CollaborationRunContext;
  workflowRunId: string;
  runtimeId: string;
  emit: EmitCollaborationEvent;
  runAgent: RunAgentForCollaboration;
  handlerRegistry: CollaborationHandlerRegistry;
};

export type CollaborationRuntime = {
  id: CollaborationRuntimeId;
  run(input: CollaborationRuntimeRunInput): Promise<CollaborationRunResult>;
};
