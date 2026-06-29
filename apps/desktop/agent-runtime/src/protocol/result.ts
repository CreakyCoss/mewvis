import type {
  ChatResult,
  AgentDefinitionsResult,
  PongResult,
  ShutdownAckResult,
  TaskResult,
} from "../agent-engine/contracts/protocol.js";
import type {
  SessionMutationResult,
  SessionResult,
} from "../runtime-session/contracts/results.js";
import type {
  CollaborationModeSummary,
  CollaborationRunResult,
} from "../collaboration-engine/index.js";

export enum AgentRuntimeResultType {
  CollaborationResult = "collaboration_result",
  CollaborationModesResult = "collaboration_modes_result",
}

export type CollaborationRuntimeResult = CollaborationRunResult & {
  type: AgentRuntimeResultType.CollaborationResult;
  requestId?: string | null;
  mode?: string | null;
};

export type CollaborationModesRuntimeResult = {
  type: AgentRuntimeResultType.CollaborationModesResult;
  requestId?: string | null;
  modes: CollaborationModeSummary[];
};

export type AgentRuntimeResult =
  | AgentDefinitionsResult
  | ChatResult
  | CollaborationModesRuntimeResult
  | CollaborationRuntimeResult
  | PongResult
  | SessionResult
  | SessionMutationResult
  | ShutdownAckResult
  | TaskResult;
