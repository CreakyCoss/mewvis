import type {
  AgentClientAgentEvent,
  AgentClientAgentInput,
  AgentClientAgentTask,
  AgentClientAgentToolsResult,
  AgentClientChatInput,
  AgentClientChatResult,
  AgentClientListRuntimeSessionsInput,
} from "./contracts";
import type {
  EmptyParams,
  AnswerQuestionParams,
  AnswerApprovalParams,
  CollaborationModeRunParams,
  CollaborationRunParams,
  CollaborationTimelineParams,
  CollaborationTimelineResult,
  RuntimeSessionDebugParams,
  RuntimeSessionDebugResult,
  RuntimeSessionParams,
  RuntimeSessionResult,
  RuntimeSessionsResult,
} from "./wire";
import { createBackendAgentClient } from "./clients/backend-client";

export interface AgentClientCapabilities {
  listAgentTools(input?: EmptyParams): Promise<AgentClientAgentToolsResult>;
}

export interface AgentClientAgent {
  chat(input: AgentClientChatInput): Promise<AgentClientChatResult>;
  run(input: AgentClientAgentInput): Promise<AgentClientAgentTask>;
}

export interface AgentClientSessionDebug {
  read(input: RuntimeSessionDebugParams): Promise<RuntimeSessionDebugResult>;
}

export interface AgentClientSession {
  list(input: AgentClientListRuntimeSessionsInput): Promise<RuntimeSessionsResult>;
  read(input: RuntimeSessionParams): Promise<RuntimeSessionResult>;
  debug: AgentClientSessionDebug;
}

export interface AgentClientCollaboration {
  run(input: CollaborationRunParams): Promise<AgentClientAgentTask>;
  runMode(input: CollaborationModeRunParams): Promise<AgentClientAgentTask>;
  readTimeline(input: CollaborationTimelineParams): Promise<CollaborationTimelineResult>;
}

export interface AgentClientEvents {
  subscribe(listener: (event: AgentClientAgentEvent) => void): Promise<() => void>;
}

export interface AgentClientTasks {
  answerApproval(input: AnswerApprovalParams): Promise<void>;
  answerQuestion(input: AnswerQuestionParams): Promise<void>;
  abort(taskId: string): Promise<void>;
  resume(taskId: string): Promise<void>;
}

export interface AgentClient {
  capabilities: AgentClientCapabilities;
  agent: AgentClientAgent;
  session: AgentClientSession;
  collaboration: AgentClientCollaboration;
  events: AgentClientEvents;
  tasks: AgentClientTasks;
}

export const createAgentClient = (): AgentClient => createBackendAgentClient();
