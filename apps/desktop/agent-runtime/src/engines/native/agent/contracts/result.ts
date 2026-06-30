import type {
  RuntimeAgentDefinition,
} from "./agents.js";
import type {
  ChatRunResult,
} from "./chat.js";

export enum AgentResultType {
  AgentDefinitions = "agent_definitions",
  ChatResult = "chat_result",
  Pong = "pong",
  SessionResult = "session_result",
  SessionMutationResult = "session_mutation_result",
  ShutdownAck = "shutdown_ack",
  TaskResult = "task_result",
}

export type ChatResult = ChatRunResult & {
  type: AgentResultType.ChatResult;
  requestId?: string | null;
};

export type AgentDefinitionsResult = {
  type: AgentResultType.AgentDefinitions;
  requestId?: string | null;
  defaultAgentId: string;
  agents: readonly RuntimeAgentDefinition[];
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
