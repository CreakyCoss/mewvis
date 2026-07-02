import { isTauri } from "@tauri-apps/api/core";
import type {
  AgentToolsResult,
  AnswerQuestionInput,
  CollaborationTimelineQuery,
  RuntimeSessionDebugQuery,
  RuntimeSessionQuery,
} from "@agent-runtime/engines/protocol";
import type { AgentClientAgentEvent } from "./contracts/events";
import type {
  AgentClientAgentInput,
  AgentClientAgentTask,
  AgentClientChatInput,
  AgentClientChatResult,
  AgentClientCollaborationInput,
  AgentClientCollaborationModeInput,
} from "./contracts/inputs";
import type {
  AgentClientCollaborationTimelineResult,
  AgentClientListRuntimeSessionsInput,
  AgentClientRuntimeSessionDebugSnapshot,
  AgentClientRuntimeSessionSnapshot,
  AgentClientRuntimeSessionsResult,
} from "./contracts/session";
import { createTauriAgentClient } from "./clients/tauri-client";
import { createWebPreviewAgentClient } from "./clients/web-preview-client";

export type AgentClientAgentToolsResult = Readonly<Pick<AgentToolsResult, "tools" | "defaultToolNames">>;

export interface AgentClientCapabilities {
  listAgentTools(): Promise<AgentClientAgentToolsResult>;
}

export interface AgentClientAgent {
  chat(input: AgentClientChatInput): Promise<AgentClientChatResult>;
  run(input: AgentClientAgentInput): Promise<AgentClientAgentTask>;
}

export interface AgentClientSessionDebug {
  read(input: RuntimeSessionDebugQuery): Promise<AgentClientRuntimeSessionDebugSnapshot>;
}

export interface AgentClientSession {
  list(input: AgentClientListRuntimeSessionsInput): Promise<AgentClientRuntimeSessionsResult>;
  read(input: RuntimeSessionQuery): Promise<AgentClientRuntimeSessionSnapshot>;
  debug: AgentClientSessionDebug;
}

export interface AgentClientCollaboration {
  run(input: AgentClientCollaborationInput): Promise<AgentClientAgentTask>;
  runMode(input: AgentClientCollaborationModeInput): Promise<AgentClientAgentTask>;
  readTimeline(input: CollaborationTimelineQuery): Promise<AgentClientCollaborationTimelineResult>;
}

export interface AgentClientEvents {
  subscribe(listener: (event: AgentClientAgentEvent) => void): Promise<() => void>;
}

export interface AgentClientTasks {
  answerQuestion(input: AnswerQuestionInput): Promise<void>;
  abort(taskId: string): Promise<void>;
}

export interface AgentClient {
  capabilities: AgentClientCapabilities;
  agent: AgentClientAgent;
  session: AgentClientSession;
  collaboration: AgentClientCollaboration;
  events: AgentClientEvents;
  tasks: AgentClientTasks;
}

const canUseTauriAgentClient = () => typeof window !== "undefined" && isTauri();

export const createAgentClient = (): AgentClient =>
  canUseTauriAgentClient() ? createTauriAgentClient() : createWebPreviewAgentClient();
