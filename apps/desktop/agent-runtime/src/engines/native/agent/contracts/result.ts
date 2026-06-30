import type {
  RuntimeAgentDefinition,
} from "./agents.js";
import type {
  ChatRunResult,
} from "./chat.js";
import type { RuntimeModelCatalog } from "./model.js";

export enum AgentResultType {
  AgentDefinitions = "agent_definitions",
  AgentTools = "agent_tools",
  ChatResult = "chat_result",
  Pong = "pong",
  RuntimeModels = "runtime_models",
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

export type AgentToolSummary = {
  name: string;
  label: string;
  description?: string | null;
  enabledByDefault: boolean;
};

export type AgentToolsResult = {
  type: AgentResultType.AgentTools;
  requestId?: string | null;
  agentId?: string | null;
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
