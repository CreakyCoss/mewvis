import type { RuntimeModelInput } from "../model.js";
import type { ChatMessageInput } from "./definition.js";
import type { AgentRuntimeResources } from "./resources.js";

export enum AgentTaskCommandType {
  SendMessage = "send_message",
  AnswerQuestion = "answer_question",
  Chat = "chat",
  ListAgentTools = "list_agent_tools",
  ListRuntimeModels = "list_runtime_models",
  Ping = "ping",
  Shutdown = "shutdown",
}

export enum AgentSessionCommandType {
  CreateSession = "create_session",
  CompactAgentSession = "compact_agent_session",
  RebuildAgentSession = "rebuild_agent_session",
  SummarizeSession = "summarize_session",
  SummarizeAgentSession = "summarize_agent_session",
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

type RuntimeSessionTarget = {
  workspacePath: string;
  sessionRootDir?: string | null;
};

type AgentTarget = {
  agentRoleId?: string | null;
};

type AgentRunMode = "chat" | "agent";

type AgentRuntimeOptions = {
  mode?: AgentRunMode | null;
  taskId?: string | null;
  streamId?: string | null;
  stream?: boolean;
  model?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
};

type AgentMessageInput = {
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

export type ListAgentToolsCommand = {
  type: AgentTaskCommandType.ListAgentTools;
  requestId?: string | null;
};

export type ListRuntimeModelsCommand = {
  type: AgentTaskCommandType.ListRuntimeModels;
  requestId?: string | null;
};

export type ChatCommand = {
  type: AgentTaskCommandType.Chat;
  requestId?: string | null;
  session?: RuntimeSessionTarget | null;
  input: AgentMessageInput;
  runtime?: Pick<AgentRuntimeOptions, "streamId" | "stream" | "model"> | null;
};

type SessionCommandBase = {
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir: string;
};

type RuntimeCompactTarget = {
  scope: "agent";
  agentRoleId: string;
};

type RuntimeCompactOptions = {
  compactInstruction?: string | null;
};

type RuntimeAgentSessionRebuildOptions = {
  rebuildInstruction?: string | null;
  userMessage?: string | null;
};

type RuntimeSummaryOptions = {
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
};

export type CompactAgentSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.CompactAgentSession;
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
  options?: RuntimeSummaryOptions | null;
  runtime?: Pick<AgentRuntimeOptions, "model"> | null;
};

export type SummarizeAgentSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.SummarizeAgentSession;
  target: RuntimeCompactTarget;
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

export type PingCommand = {
  type: AgentTaskCommandType.Ping;
  requestId?: string | null;
};

export type ShutdownCommand = {
  type: AgentTaskCommandType.Shutdown;
  requestId?: string | null;
};

export type AgentTaskCommand =
  | SendMessageCommand
  | AnswerQuestionCommand
  | ChatCommand
  | ListAgentToolsCommand
  | ListRuntimeModelsCommand
  | PingCommand
  | ShutdownCommand;

export type AgentSessionCommand =
  | CreateSessionCommand
  | CompactAgentSessionCommand
  | RebuildAgentSessionCommand
  | SummarizeSessionCommand
  | SummarizeAgentSessionCommand
  | MessageEditCommand
  | MessageDeleteCommand
  | MessageAppendCommand
  | RebuildCommand
  | ReadSessionCommand;

export type AgentCommand = AgentTaskCommand | AgentSessionCommand;
