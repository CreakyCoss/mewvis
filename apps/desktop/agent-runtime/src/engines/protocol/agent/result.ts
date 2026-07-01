import type { RuntimeModelCatalog } from "../model.js";
import type { RuntimeSessionRecordRef } from "./event.js";

export enum AgentResultType {
  AgentTools = "agent_tools",
  ChatResult = "chat_result",
  Pong = "pong",
  RuntimeModels = "runtime_models",
  SessionResult = "session_result",
  SessionMutationResult = "session_mutation_result",
  ShutdownAck = "shutdown_ack",
  TaskResult = "task_result",
}

type ChatRunResult = {
  text: string;
  thinking?: string | null;
  runtimeSession?: RuntimeSessionRecordRef | null;
};

export type ChatResult = ChatRunResult & {
  type: AgentResultType.ChatResult;
  requestId?: string | null;
};

export type AgentToolSummary = {
  name: string;
  label: string;
  description?: string | null;
  enabledByDefault: boolean;
};

export type AgentToolsResult = {
  type: AgentResultType.AgentTools;
  requestId?: string | null;
  tools: readonly AgentToolSummary[];
  defaultToolNames: readonly string[];
};

export type RuntimeModelsResult = {
  type: AgentResultType.RuntimeModels;
  requestId?: string | null;
  catalog: RuntimeModelCatalog;
};

export type PongResult = {
  type: AgentResultType.Pong;
  requestId?: string | null;
};

export type ShutdownAckResult = {
  type: AgentResultType.ShutdownAck;
  requestId?: string | null;
};

export type TaskResult = {
  type: AgentResultType.TaskResult;
  requestId?: string | null;
  taskId: string;
  success: boolean;
  message?: string;
};
