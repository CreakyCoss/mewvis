import type { RuntimeAgentDefinition } from "../engine/agent/contracts/agents.js";
import type { RuntimeSessionRecordRef } from "../engine/agent/contracts/events.js";
import type { RuntimeModelInput } from "../engine/agent/contracts/model.js";
import type { AgentRuntimeResources } from "../engine/agent/contracts/resources.js";

export enum AgentTaskCommandType {
  SendMessage = "send_message",
  AnswerQuestion = "answer_question",
  Chat = "chat",
  ListAgents = "list_agents",
  Ping = "ping",
  Shutdown = "shutdown",
}

export enum AgentSessionCommandType {
  CreateSession = "create_session",
  Compact = "compact",
  RebuildAgentSession = "rebuild_agent_session",
  SummarizeSession = "summarize_session",
  MessageEdit = "message_edit",
  MessageDelete = "message_delete",
  MessageAppend = "message_append",
  Rebuild = "rebuild",
  ReadSession = "read_session",
}

export const AgentCommandType = {
  ...AgentTaskCommandType,
  ...AgentSessionCommandType,
} as const;

export type AgentCommandType = AgentTaskCommandType | AgentSessionCommandType;

export enum AgentResultType {
  AgentDefinitions = "agent_definitions",
  ChatResult = "chat_result",
  Pong = "pong",
  SessionResult = "session_result",
  SessionMutationResult = "session_mutation_result",
  ShutdownAck = "shutdown_ack",
  TaskResult = "task_result",
}

export type RuntimeSessionTarget = {
  workspacePath: string;
  sessionRootDir?: string | null;
};

export type AgentTarget = {
  agentId?: string | null;
  agentRoleId?: string | null;
};

export type AgentRunMode = "chat" | "agent";

export type AgentRuntimeOptions = {
  mode?: AgentRunMode | null;
  taskId?: string | null;
  streamId?: string | null;
  stream?: boolean;
  model?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
};

export type ChatMessageInput = {
  role: string;
  content: string;
};

export type AgentMessageInput = {
  userMessage?: string | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  messages?: ChatMessageInput[];
};

export type SendMessageCommand = {
  type: AgentTaskCommandType.SendMessage;
  requestId?: string | null;
  session: RuntimeSessionTarget;
  agent?: AgentTarget | null;
  input: AgentMessageInput & {
    userMessage: string;
  };
  runtime?: AgentRuntimeOptions | null;
};

export type AnswerQuestionCommand = {
  type: AgentTaskCommandType.AnswerQuestion;
  requestId?: string | null;
  taskId: string;
  questionId: string;
  answer: string;
};

export type ListAgentsCommand = {
  type: AgentTaskCommandType.ListAgents;
  requestId?: string | null;
};

export type ChatCommand = {
  type: AgentTaskCommandType.Chat;
  requestId?: string | null;
  session?: RuntimeSessionTarget | null;
  agent?: Pick<AgentTarget, "agentId"> | null;
  input: AgentMessageInput;
  runtime?: Pick<AgentRuntimeOptions, "streamId" | "stream" | "model"> | null;
};

export type ChatResult = {
  type: AgentResultType.ChatResult;
  requestId?: string | null;
  text: string;
  thinking?: string | null;
  runtimeSession?: RuntimeSessionRecordRef | null;
};

export type SessionCommandBase = {
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir: string;
};

export type RuntimeCompactTarget = {
  scope: "agent";
  agentId?: string | null;
  agentRoleId: string;
};

export type RuntimeCompactOptions = {
  compactInstruction?: string | null;
};

export type RuntimeAgentSessionRebuildOptions = {
  rebuildInstruction?: string | null;
  userMessage?: string | null;
};

export type RuntimeSummaryOptions = {
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
};

export type CompactCommand = SessionCommandBase & {
  type: AgentSessionCommandType.Compact;
  target: RuntimeCompactTarget;
  options?: RuntimeCompactOptions | null;
  runtime?: Pick<AgentRuntimeOptions, "model" | "resources"> | null;
};

export type RebuildAgentSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.RebuildAgentSession;
  target: RuntimeCompactTarget;
  options?: RuntimeAgentSessionRebuildOptions | null;
  runtime?: Pick<AgentRuntimeOptions, "model" | "resources"> | null;
};

export type SummarizeSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.SummarizeSession;
  agent?: Pick<AgentTarget, "agentId"> | null;
  options?: RuntimeSummaryOptions | null;
  runtime?: Pick<AgentRuntimeOptions, "model"> | null;
};

export type CreateSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.CreateSession;
  systemPrompt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MessageEditCommand = SessionCommandBase & {
  type: AgentSessionCommandType.MessageEdit;
  messageRecordId: string;
  content: string;
};

export type MessageDeleteCommand = SessionCommandBase & {
  type: AgentSessionCommandType.MessageDelete;
  messageRecordId: string;
};

export type MessageAppendCommand = SessionCommandBase & {
  type: AgentSessionCommandType.MessageAppend;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: number | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

export type RebuildCommand = SessionCommandBase & {
  type: AgentSessionCommandType.Rebuild;
  messages: MessageAppendCommand["messages"];
};

export type ReadSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.ReadSession;
};

export type AgentDefinitionsResult = {
  type: AgentResultType.AgentDefinitions;
  requestId?: string | null;
  defaultAgentId: string;
  agents: readonly RuntimeAgentDefinition[];
};

export type PingCommand = {
  type: AgentTaskCommandType.Ping;
  requestId?: string | null;
};

export type ShutdownCommand = {
  type: AgentTaskCommandType.Shutdown;
  requestId?: string | null;
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

export type AgentTaskCommand =
  | SendMessageCommand
  | AnswerQuestionCommand
  | ChatCommand
  | ListAgentsCommand
  | PingCommand
  | ShutdownCommand;

export type AgentSessionCommand =
  | CreateSessionCommand
  | CompactCommand
  | RebuildAgentSessionCommand
  | SummarizeSessionCommand
  | MessageEditCommand
  | MessageDeleteCommand
  | MessageAppendCommand
  | RebuildCommand
  | ReadSessionCommand;

export type AgentCommand = AgentTaskCommand | AgentSessionCommand;
