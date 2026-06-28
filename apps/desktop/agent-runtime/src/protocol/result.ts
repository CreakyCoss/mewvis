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
} from "../agent-engine/session/contracts/results.js";
import type {
  CollaborationRunResult,
} from "../collaboration-engine/index.js";

export enum AgentRuntimeResultType {
  CollaborationResult = "collaboration_result",
}

export type CollaborationRuntimeResult = CollaborationRunResult & {
  type: AgentRuntimeResultType.CollaborationResult;
  requestId?: string | null;
};

export type AgentRuntimeResult =
  | AgentDefinitionsResult
  | ChatResult
  | CollaborationRuntimeResult
  | PongResult
  | SessionResult
  | SessionMutationResult
  | ShutdownAckResult
  | TaskResult;
