import type {
  AgentDefinitionsResult,
  AgentRuntimeCallbacks,
  AgentRunCommand,
  ChatResult,
  ChatRunCommand,
  EmitAgentEvent,
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
import type {
  CollaborationModesRuntimeResult,
  CollaborationRuntimeResult,
  CollaborationTimelineResult,
  RuntimeSessionResult,
  RuntimeSessionsResult,
} from "./protocol/result.js";

export type WriteAgentRuntimeJsonLine = (value: unknown) => void;

export type RuntimeEngineOptions = {
  callbacks?: Partial<AgentRuntimeCallbacks>;
  close?: () => void;
  emit?: EmitAgentEvent;
  writeJsonLine?: WriteAgentRuntimeJsonLine;
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
