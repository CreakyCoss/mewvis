import type { BridgeCommand } from "../agent-engine/contracts/protocol.js";
import type {
  CollaborationModeRunInput,
  CollaborationRunInput,
} from "../collaboration-engine/index.js";

export enum AgentRuntimeCommandType {
  ListCollaborationModes = "list_collaboration_modes",
  RunCollaboration = "run_collaboration",
  RunCollaborationMode = "run_collaboration_mode",
}

export type ListCollaborationModesCommand = {
  type: AgentRuntimeCommandType.ListCollaborationModes;
  requestId?: string | null;
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
  | ListCollaborationModesCommand
  | RunCollaborationCommand
  | RunCollaborationModeCommand;
