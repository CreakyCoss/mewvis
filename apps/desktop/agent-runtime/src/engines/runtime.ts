import type {
  AgentDefinitionsResult,
  AgentRuntimeCallbacks,
  AgentRunCommand,
  ChatResult,
  ChatRunCommand,
  ListAgentsCommand,
  PingCommand,
  PongResult,
  ShutdownAckResult,
  ShutdownCommand,
  TaskResult,
} from "./protocol/agent.js";
import type {
  AgentRuntimeCommand,
  GetCollaborationTimelineCommand,
  GetRuntimeSessionCommand,
  ListCollaborationModesCommand,
  ListRuntimeSessionsCommand,
  RunCollaborationCommand,
  RunCollaborationModeCommand,
} from "./protocol/command.js";
import type { AgentRuntimeEvent } from "./protocol/event.js";
import type {
  AgentRuntimeResult,
  CollaborationModesRuntimeResult,
  CollaborationRuntimeResult,
  CollaborationTimelineResult,
  RuntimeSessionResult,
  RuntimeSessionsResult,
} from "./protocol/result.js";

export type EmitAgentRuntimeEvent = (event: AgentRuntimeEvent) => void;
export type EmitAgentRuntimeResult = (result: AgentRuntimeResult) => void;

export type RuntimeEngineCallbacks = Partial<AgentRuntimeCallbacks> & {
  onEvent?: EmitAgentRuntimeEvent;
  onResult?: EmitAgentRuntimeResult;
};

export type RuntimeEngineOptions = {
  callbacks?: RuntimeEngineCallbacks;
  close?: () => void;
};

export abstract class AgentRuntimeEngine {
  abstract readonly id: string;

  abstract handle(command: AgentRuntimeCommand): Promise<boolean>;

  abstract ping(command: PingCommand): Promise<PongResult>;
  abstract shutdown(command: ShutdownCommand): Promise<ShutdownAckResult>;
  abstract listAgents(command: ListAgentsCommand): Promise<AgentDefinitionsResult>;
  abstract chat(command: ChatRunCommand): Promise<ChatResult>;
  abstract runAgent(command: AgentRunCommand): Promise<TaskResult>;

  abstract listRuntimeSessions(
    command: ListRuntimeSessionsCommand,
  ): Promise<RuntimeSessionsResult>;
  abstract getRuntimeSession(command: GetRuntimeSessionCommand): Promise<RuntimeSessionResult>;
  abstract getCollaborationTimeline(
    command: GetCollaborationTimelineCommand,
  ): Promise<CollaborationTimelineResult>;

  abstract listCollaborationModes(
    command: ListCollaborationModesCommand,
  ): Promise<CollaborationModesRuntimeResult>;
  abstract runCollaboration(command: RunCollaborationCommand): Promise<CollaborationRuntimeResult>;
  abstract runCollaborationMode(
    command: RunCollaborationModeCommand,
  ): Promise<CollaborationRuntimeResult>;

  abstract waitForRunningTask(): Promise<void>;
}
