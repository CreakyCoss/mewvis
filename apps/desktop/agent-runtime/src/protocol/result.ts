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
  RuntimeSessionSnapshot,
  RuntimeSessionSummary,
  RuntimeSessionTimelineItem,
} from "../runtime-session/index.js";
import type {
  CollaborationModeSummary,
  CollaborationRunResult,
} from "../collaboration-engine/index.js";

export enum AgentRuntimeResultType {
  CollaborationTimelineResult = "collaboration_timeline_result",
  CollaborationResult = "collaboration_result",
  CollaborationModesResult = "collaboration_modes_result",
  RuntimeSessionResult = "runtime_session_result",
  RuntimeSessionsResult = "runtime_sessions_result",
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

export type RuntimeSessionsResult = {
  type: AgentRuntimeResultType.RuntimeSessionsResult;
  requestId?: string | null;
  sessions: RuntimeSessionSummary[];
};

export type RuntimeSessionResult = RuntimeSessionSnapshot & {
  type: AgentRuntimeResultType.RuntimeSessionResult;
  requestId?: string | null;
};

export type CollaborationTimelineResult = {
  type: AgentRuntimeResultType.CollaborationTimelineResult;
  requestId?: string | null;
  session: RuntimeSessionSummary;
  workflowRunId?: string | null;
  events: RuntimeSessionTimelineItem[];
};

export type AgentRuntimeResult =
  | AgentDefinitionsResult
  | ChatResult
  | CollaborationModesRuntimeResult
  | CollaborationRuntimeResult
  | CollaborationTimelineResult
  | PongResult
  | RuntimeSessionResult
  | RuntimeSessionsResult
  | SessionResult
  | SessionMutationResult
  | ShutdownAckResult
  | TaskResult;
