import type {
  AgentToolsResult as WireAgentToolsResult,
  ExtensionCommandsResult,
  ExtensionCommandResult,
  ChatResult as WireChatResult,
  CollaborationModesResult as WireCollaborationModesResult,
  CollaborationResult as WireCollaborationResult,
  CollaborationTimelineResult as WireCollaborationTimelineResult,
  PongResult as WirePongResult,
  RuntimeModelsResult as WireRuntimeModelsResult,
  RuntimeSessionDebugResult as WireRuntimeSessionDebugResult,
  RuntimeSessionResult as WireRuntimeSessionResult,
  RuntimeSessionsResult as WireRuntimeSessionsResult,
  SessionMutationResult as WireSessionMutationResult,
  SessionResult as WireSessionResult,
  ShutdownAckResult as WireShutdownAckResult,
  TaskResult as WireTaskResult,
} from "../wire.js";

type InternalResultMetadata = {
  requestId?: string | null;
};

export type ChatResult = WireChatResult & InternalResultMetadata;
export type AgentToolsResult = WireAgentToolsResult & InternalResultMetadata;
export type RuntimeModelsResult = WireRuntimeModelsResult & InternalResultMetadata;
export type PongResult = WirePongResult & InternalResultMetadata;
export type ShutdownAckResult = WireShutdownAckResult & InternalResultMetadata;
export type TaskResult = WireTaskResult & InternalResultMetadata;
export type SessionResult = WireSessionResult & InternalResultMetadata;
export type SessionMutationResult = WireSessionMutationResult & InternalResultMetadata;
export type CollaborationRuntimeResult = WireCollaborationResult & InternalResultMetadata;
export type CollaborationModesRuntimeResult = WireCollaborationModesResult & InternalResultMetadata;
export type RuntimeSessionsResult = WireRuntimeSessionsResult & InternalResultMetadata;
export type RuntimeSessionResult = WireRuntimeSessionResult & InternalResultMetadata;
export type RuntimeSessionDebugResult = WireRuntimeSessionDebugResult & InternalResultMetadata;
export type CollaborationTimelineResult = WireCollaborationTimelineResult & InternalResultMetadata;

export type AgentRuntimeResult =
  | (ExtensionCommandsResult & InternalResultMetadata)
  | (ExtensionCommandResult & InternalResultMetadata)
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
