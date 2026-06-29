import type { BridgeCommand } from "../agent-engine/contracts/protocol.js";
import type {
  CollaborationModeRunInput,
  CollaborationRunInput,
} from "../collaboration-engine/index.js";

export enum AgentRuntimeCommandType {
  GetCollaborationTimeline = "get_collaboration_timeline",
  GetRuntimeSession = "get_runtime_session",
  ListRuntimeSessions = "list_runtime_sessions",
  ListCollaborationModes = "list_collaboration_modes",
  RunCollaboration = "run_collaboration",
  RunCollaborationMode = "run_collaboration_mode",
}

export type ListCollaborationModesCommand = {
  type: AgentRuntimeCommandType.ListCollaborationModes;
  requestId?: string | null;
};

export type ListRuntimeSessionsCommand = {
  type: AgentRuntimeCommandType.ListRuntimeSessions;
  requestId?: string | null;
  workspacePath: string;
  rootDir: string;
  limit?: number | null;
  maxDepth?: number | null;
};

export type GetRuntimeSessionCommand = {
  type: AgentRuntimeCommandType.GetRuntimeSession;
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir: string;
  includeLedger?: boolean | null;
  includeTrace?: boolean | null;
  includeTimeline?: boolean | null;
  timelineLimit?: number | null;
};

export type GetCollaborationTimelineCommand = {
  type: AgentRuntimeCommandType.GetCollaborationTimeline;
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir: string;
  workflowRunId?: string | null;
  limit?: number | null;
};

export type RunCollaborationCommand = {
  type: AgentRuntimeCommandType.RunCollaboration;
  requestId?: string | null;
  input: CollaborationRunInput;
};

export type RunCollaborationModeCommand = {
  type: AgentRuntimeCommandType.RunCollaborationMode;
  requestId?: string | null;
  input: CollaborationModeRunInput;
};

export type AgentRuntimeCommand =
  | BridgeCommand
  | GetCollaborationTimelineCommand
  | GetRuntimeSessionCommand
  | ListCollaborationModesCommand
  | ListRuntimeSessionsCommand
  | RunCollaborationCommand
  | RunCollaborationModeCommand;
