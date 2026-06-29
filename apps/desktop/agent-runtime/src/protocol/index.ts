import type { AgentEvent } from "../engine/agent/contracts/events.js";
import type { CollaborationEvent } from "../engine/collaboration/contracts/event.js";

export type AgentRuntimeEvent = AgentEvent | CollaborationEvent;

export {
  AgentRuntimeCommandType,
} from "./command.js";
export type {
  AgentRuntimeCommand,
  GetCollaborationTimelineCommand,
  GetRuntimeSessionCommand,
  ListCollaborationModesCommand,
  ListRuntimeSessionsCommand,
  RunCollaborationCommand,
  RunCollaborationModeCommand,
} from "./command.js";
export {
  AgentRuntimeResultType,
} from "./result.js";
export type {
  AgentRuntimeResult,
  CollaborationTimelineResult,
  CollaborationModesRuntimeResult,
  CollaborationRuntimeResult,
  RuntimeSessionResult,
  RuntimeSessionsResult,
} from "./result.js";
