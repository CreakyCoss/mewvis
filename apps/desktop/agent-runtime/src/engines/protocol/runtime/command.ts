import type { AgentCommand } from "../agent/index.js";
import type {
  CollaborationModeRunInput,
  CollaborationRunInput,
} from "../collaboration/index.js";

export enum AgentRuntimeCommandType {
  ListRuntimeSessions = "list_runtime_sessions",
  ReadRuntimeSession = "read_runtime_session",
  ReadCollaborationTimeline = "read_collaboration_timeline",
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

export type ReadRuntimeSessionCommand = {
  type: AgentRuntimeCommandType.ReadRuntimeSession;
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir: string;
  includeLedger?: boolean | null;
  includeTrace?: boolean | null;
  includeTimeline?: boolean | null;
  timelineLimit?: number | null;
};

export type ReadCollaborationTimelineCommand = {
  type: AgentRuntimeCommandType.ReadCollaborationTimeline;
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
  | AgentCommand
  | ListCollaborationModesCommand
  | ListRuntimeSessionsCommand
  | ReadCollaborationTimelineCommand
  | ReadRuntimeSessionCommand
  | RunCollaborationCommand
  | RunCollaborationModeCommand;
