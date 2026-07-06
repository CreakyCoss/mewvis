import type {
  AgentToolsResult,
  ChatResult,
  PongResult,
  RuntimeModelsResult,
  ShutdownAckResult,
  TaskResult,
} from "../agent/index.js";
import type { CollaborationModeSummary, CollaborationRunResult } from "../collaboration/index.js";
import type {
  RuntimeSessionDebugSnapshot,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary,
  RuntimeSessionTimelineItem,
  SessionMutationResult,
  SessionResult,
} from "../session.js";

export enum AgentRuntimeResultType {
  CollaborationTimelineResult = "collaboration_timeline_result",
  CollaborationResult = "collaboration_result",
  CollaborationModesResult = "collaboration_modes_result",
  RuntimeSessionDebugResult = "runtime_session_debug_result",
  RuntimeSessionResult = "runtime_session_result",
  RuntimeSessionsResult = "runtime_sessions_result",
}

export type CollaborationRuntimeResult = CollaborationRunResult & {
  type: AgentRuntimeResultType.CollaborationResult;
  requestId?: string | null;
  mode?: string | null;
  success?: boolean;
  message?: string;
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

export type RuntimeSessionDebugResult = RuntimeSessionDebugSnapshot & {
  type: AgentRuntimeResultType.RuntimeSessionDebugResult;
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
  | AgentToolsResult
  | ChatResult
  | CollaborationModesRuntimeResult
  | CollaborationRuntimeResult
  | CollaborationTimelineResult
  | PongResult
  | RuntimeModelsResult
  | RuntimeSessionDebugResult
  | RuntimeSessionResult
  | RuntimeSessionsResult
  | SessionResult
  | SessionMutationResult
  | ShutdownAckResult
  | TaskResult;
