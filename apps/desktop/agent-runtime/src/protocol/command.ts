import type { BridgeCommand } from "../agent-engine/contracts/protocol.js";
import type { CollaborationRunInput } from "../collaboration-engine/index.js";

export enum AgentRuntimeCommandType {
  RunCollaboration = "run_collaboration",
}

export type RunCollaborationCommand = {
  type: AgentRuntimeCommandType.RunCollaboration;
  requestId?: string | null;
  input: CollaborationRunInput;
};

export type AgentRuntimeCommand = BridgeCommand | RunCollaborationCommand;
