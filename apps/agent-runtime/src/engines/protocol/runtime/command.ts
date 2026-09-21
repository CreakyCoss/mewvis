import type { AgentCommand } from "../agent/command.js";
import type { CollaborationModeRunInput, CollaborationRunInput } from "../collaboration/workflow.js";
import type {
  CollaborationTimelineParams,
  EmptyParams,
  ExtensionCommandsParams,
  ExtensionCommandParams,
  RuntimeSessionDebugParams,
  RuntimeSessionParams,
  RuntimeSessionsParams,
} from "../wire.js";

export enum AgentRuntimeCommandType {
  ListExtensionCommands = "list_extension_commands",
  ExecuteExtensionCommand = "execute_extension_command",
  ListRuntimeSessions = "list_runtime_sessions",
  ReadRuntimeSession = "read_runtime_session",
  ReadRuntimeSessionDebug = "read_runtime_session_debug",
  ReadCollaborationTimeline = "read_collaboration_timeline",
  ListCollaborationModes = "list_collaboration_modes",
  RunCollaboration = "run_collaboration",
  RunCollaborationMode = "run_collaboration_mode",
}

type InternalRuntimeCommand<TType extends AgentRuntimeCommandType, TParams> = TParams & {
  type: TType;
  requestId?: string | null;
};

type ListCollaborationModesCommand = InternalRuntimeCommand<
  AgentRuntimeCommandType.ListCollaborationModes,
  EmptyParams
>;
type ListRuntimeSessionsCommand = InternalRuntimeCommand<
  AgentRuntimeCommandType.ListRuntimeSessions,
  RuntimeSessionsParams
>;
type ReadRuntimeSessionCommand = InternalRuntimeCommand<
  AgentRuntimeCommandType.ReadRuntimeSession,
  RuntimeSessionParams
>;
type ReadRuntimeSessionDebugCommand = InternalRuntimeCommand<
  AgentRuntimeCommandType.ReadRuntimeSessionDebug,
  RuntimeSessionDebugParams
>;
type ReadCollaborationTimelineCommand = InternalRuntimeCommand<
  AgentRuntimeCommandType.ReadCollaborationTimeline,
  CollaborationTimelineParams
>;

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
  | InternalRuntimeCommand<AgentRuntimeCommandType.ListExtensionCommands, ExtensionCommandsParams>
  | InternalRuntimeCommand<AgentRuntimeCommandType.ExecuteExtensionCommand, ExtensionCommandParams>
  | AgentCommand
  | ListCollaborationModesCommand
  | ListRuntimeSessionsCommand
  | ReadCollaborationTimelineCommand
  | ReadRuntimeSessionDebugCommand
  | ReadRuntimeSessionCommand
  | RunCollaborationCommand
  | RunCollaborationModeCommand;
