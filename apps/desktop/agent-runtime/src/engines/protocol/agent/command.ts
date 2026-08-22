import type {
  AgentRuntimeResources,
  AgentRunParams,
  AnswerQuestionParams,
  ChatParams,
  EmptyParams,
  MessageDeleteParams,
  MessageEditParams,
  RuntimeModelInput,
  SessionMessagesParams,
  SessionTargetParams,
} from "../wire.js";

export enum AgentTaskCommandType {
  RunAgent = "run_agent",
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

type AgentCommandType = AgentTaskCommandType | AgentSessionCommandType;

type InternalCommand<TType extends AgentCommandType, TParams> = TParams & {
  type: TType;
  requestId?: string | null;
};

type AgentRuntimeModelResourcesOptions = {
  model?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
};

type AgentRuntimeIdModelOptions = {
  runtimeId?: string | null;
  model?: RuntimeModelInput | null;
};

type AgentRuntimeModelOptions = {
  model?: RuntimeModelInput | null;
};

export type RunAgentCommand = InternalCommand<AgentTaskCommandType.RunAgent, AgentRunParams>;
export type AnswerQuestionCommand = InternalCommand<AgentTaskCommandType.AnswerQuestion, AnswerQuestionParams>;
type ListAgentToolsCommand = InternalCommand<AgentTaskCommandType.ListAgentTools, EmptyParams>;
type ListRuntimeModelsCommand = InternalCommand<AgentTaskCommandType.ListRuntimeModels, EmptyParams>;
export type ChatCommand = InternalCommand<AgentTaskCommandType.Chat, ChatParams>;

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

type CompactAgentSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.CompactAgentSession;
  target: RuntimeCompactTarget;
  options?: RuntimeCompactOptions | null;
  runtime?: AgentRuntimeModelResourcesOptions | null;
};

type RebuildAgentSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.RebuildAgentSession;
  target: RuntimeCompactTarget;
  options?: RuntimeAgentSessionRebuildOptions | null;
  runtime?: AgentRuntimeModelResourcesOptions | null;
};

export type SummarizeSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.SummarizeSession;
  options?: RuntimeSummaryOptions | null;
  runtime?: AgentRuntimeIdModelOptions | null;
};

type SummarizeAgentSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.SummarizeAgentSession;
  target: RuntimeCompactTarget;
  options?: RuntimeSummaryOptions | null;
  runtime?: AgentRuntimeModelOptions | null;
};

export type CreateSessionCommand = SessionCommandBase & {
  type: AgentSessionCommandType.CreateSession;
  systemPrompt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MessageEditCommand = InternalCommand<AgentSessionCommandType.MessageEdit, MessageEditParams>;
export type MessageDeleteCommand = InternalCommand<AgentSessionCommandType.MessageDelete, MessageDeleteParams>;
export type MessageAppendCommand = InternalCommand<AgentSessionCommandType.MessageAppend, SessionMessagesParams>;
export type RebuildCommand = InternalCommand<AgentSessionCommandType.Rebuild, SessionMessagesParams>;
export type ReadSessionCommand = InternalCommand<AgentSessionCommandType.ReadSession, SessionTargetParams>;
type PingCommand = InternalCommand<AgentTaskCommandType.Ping, EmptyParams>;
type ShutdownCommand = InternalCommand<AgentTaskCommandType.Shutdown, EmptyParams>;

type AgentTaskCommand =
  | RunAgentCommand
  | AnswerQuestionCommand
  | ChatCommand
  | ListAgentToolsCommand
  | ListRuntimeModelsCommand
  | PingCommand
  | ShutdownCommand;

type AgentSessionCommand =
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
