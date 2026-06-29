import type { AgentToolName } from "../tools/definitions.js";
import type { BridgeAgentDefinition } from "../runtimes/agents.js";
import type { RuntimeModelInput } from "./model.js";
import type { AskUserInput } from "../tools/types.js";

export enum BridgeTaskCommandType {
  SendMessage = "send_message",
  AnswerQuestion = "answer_question",
  Chat = "chat",
  ListAgents = "list_agents",
  Ping = "ping",
  Shutdown = "shutdown",
}

export enum BridgeContextCommandType {
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

export const BridgeCommandType = {
  ...BridgeTaskCommandType,
  ...BridgeContextCommandType,
} as const;

export type BridgeCommandType = BridgeTaskCommandType | BridgeContextCommandType;

export enum BridgeResultType {
  AgentDefinitions = "agent_definitions",
  ChatResult = "chat_result",
  Pong = "pong",
  SessionResult = "session_result",
  SessionMutationResult = "session_mutation_result",
  ShutdownAck = "shutdown_ack",
  TaskResult = "task_result",
}

export enum BridgeEventType {
  Started = "started",
  Question = "question",
  QuestionAnswered = "question_answered",
  ReplaceText = "replace_text",
  TextDelta = "text_delta",
  ThinkingDelta = "thinking_delta",
  ThinkingEnd = "thinking_end",
  ToolStart = "tool_start",
  ToolUpdate = "tool_update",
  ToolEnd = "tool_end",
  Done = "done",
  Error = "error",
}

export type BridgeRuntimeMcpResources = {
  servers?: unknown[];
  [key: string]: unknown;
};

export type BridgeRuntimeToolResources = {
  allowed?: AgentToolName[] | null;
};

export type BridgeRuntimeSkillResources = {
  bundledPath?: string | string[] | null;
  paths?: string[] | null;
  enabled?: string[] | null;
};

export type BridgeRuntimeResources = {
  tools?: BridgeRuntimeToolResources | null;
  skills?: BridgeRuntimeSkillResources | null;
  mcp?: BridgeRuntimeMcpResources | null;
};

export type BridgeSessionTarget = {
  workspacePath: string;
  sessionRootDir?: string | null;
};

export type BridgeAgentTarget = {
  agentId?: string | null;
  agentRoleId?: string | null;
};

export type BridgeRunMode = "chat" | "agent";

export type BridgeRuntimeOptions = {
  mode?: BridgeRunMode | null;
  taskId?: string | null;
  streamId?: string | null;
  stream?: boolean;
  model?: RuntimeModelInput | null;
  resources?: BridgeRuntimeResources | null;
};

export type ChatMessageInput = {
  role: string;
  content: string;
};

export type BridgeMessageInput = {
  userMessage?: string | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  messages?: ChatMessageInput[];
};

export type SendMessageCommand = {
  type: BridgeTaskCommandType.SendMessage;
  requestId?: string | null;
  session: BridgeSessionTarget;
  agent?: BridgeAgentTarget | null;
  input: BridgeMessageInput & {
    userMessage: string;
  };
  runtime?: BridgeRuntimeOptions | null;
};

export type AnswerQuestionCommand = {
  type: BridgeTaskCommandType.AnswerQuestion;
  requestId?: string | null;
  taskId: string;
  questionId: string;
  answer: string;
};

export type ListAgentsCommand = {
  type: BridgeTaskCommandType.ListAgents;
  requestId?: string | null;
};

export type ChatCommand = {
  type: BridgeTaskCommandType.Chat;
  requestId?: string | null;
  session?: BridgeSessionTarget | null;
  agent?: Pick<BridgeAgentTarget, "agentId"> | null;
  input: BridgeMessageInput;
  runtime?: Pick<BridgeRuntimeOptions, "streamId" | "stream" | "model"> | null;
};

export type ChatResult = {
  type: BridgeResultType.ChatResult;
  requestId?: string | null;
  text: string;
  thinking?: string | null;
  bridgeSession?: BridgeSessionRecordRef | null;
};

export type BridgeSessionRecordRef = {
  sessionRootDir: string;
  userMessageRecordId?: string | null;
  requestContextRecordId?: string | null;
  runtimeInstructionRecordId?: string | null;
  assistantMessageRecordId?: string | null;
};

export type SessionCommandBase = {
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir: string;
};

export type BridgeCompactTarget = {
  scope: "agent";
  agentId?: string | null;
  agentRoleId: string;
};

export type BridgeCompactOptions = {
  compactInstruction?: string | null;
};

export type BridgeAgentSessionRebuildOptions = {
  rebuildInstruction?: string | null;
  userMessage?: string | null;
};

export type BridgeSummaryOptions = {
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
};

export type CompactCommand = SessionCommandBase & {
  type: BridgeContextCommandType.Compact;
  target: BridgeCompactTarget;
  options?: BridgeCompactOptions | null;
  runtime?: Pick<BridgeRuntimeOptions, "model" | "resources"> | null;
};

export type RebuildAgentSessionCommand = SessionCommandBase & {
  type: BridgeContextCommandType.RebuildAgentSession;
  target: BridgeCompactTarget;
  options?: BridgeAgentSessionRebuildOptions | null;
  runtime?: Pick<BridgeRuntimeOptions, "model" | "resources"> | null;
};

export type SummarizeSessionCommand = SessionCommandBase & {
  type: BridgeContextCommandType.SummarizeSession;
  agent?: Pick<BridgeAgentTarget, "agentId"> | null;
  options?: BridgeSummaryOptions | null;
  runtime?: Pick<BridgeRuntimeOptions, "model"> | null;
};

export type CreateSessionCommand = SessionCommandBase & {
  type: BridgeContextCommandType.CreateSession;
  systemPrompt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MessageEditCommand = SessionCommandBase & {
  type: BridgeContextCommandType.MessageEdit;
  messageRecordId: string;
  content: string;
};

export type MessageDeleteCommand = SessionCommandBase & {
  type: BridgeContextCommandType.MessageDelete;
  messageRecordId: string;
};

export type MessageAppendCommand = SessionCommandBase & {
  type: BridgeContextCommandType.MessageAppend;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: number | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

export type RebuildCommand = SessionCommandBase & {
  type: BridgeContextCommandType.Rebuild;
  messages: MessageAppendCommand["messages"];
};

export type ReadSessionCommand = SessionCommandBase & {
  type: BridgeContextCommandType.ReadSession;
};

export type AgentDefinitionsResult = {
  type: BridgeResultType.AgentDefinitions;
  requestId?: string | null;
  defaultAgentId: string;
  agents: readonly BridgeAgentDefinition[];
};

export type PingCommand = {
  type: BridgeTaskCommandType.Ping;
  requestId?: string | null;
};

export type ShutdownCommand = {
  type: BridgeTaskCommandType.Shutdown;
  requestId?: string | null;
};

export type PongResult = {
  type: BridgeResultType.Pong;
  requestId?: string | null;
};

export type ShutdownAckResult = {
  type: BridgeResultType.ShutdownAck;
  requestId?: string | null;
};

export type TaskResult = {
  type: BridgeResultType.TaskResult;
  requestId?: string | null;
  taskId: string;
  success: boolean;
  message?: string;
};

export type BridgeTaskCommand =
  | SendMessageCommand
  | AnswerQuestionCommand
  | ChatCommand
  | ListAgentsCommand
  | PingCommand
  | ShutdownCommand;

export type BridgeContextCommand =
  | CreateSessionCommand
  | CompactCommand
  | RebuildAgentSessionCommand
  | SummarizeSessionCommand
  | MessageEditCommand
  | MessageDeleteCommand
  | MessageAppendCommand
  | RebuildCommand
  | ReadSessionCommand;

export type BridgeCommand = BridgeTaskCommand | BridgeContextCommand;

export type BridgeEvent =
  | { type: BridgeEventType.Started; taskId: string }
  | {
    type: BridgeEventType.Question;
    taskId: string;
    questionId: string;
    question: string;
    context?: string | null;
    input?: AskUserInput;
  }
  | { type: BridgeEventType.QuestionAnswered; taskId: string; questionId: string; answer: string }
  | { type: BridgeEventType.ReplaceText; taskId: string; text: string }
  | { type: BridgeEventType.TextDelta; taskId: string; delta: string }
  | { type: BridgeEventType.ThinkingDelta; taskId: string; delta: string }
  | { type: BridgeEventType.ThinkingEnd; taskId: string; content: string }
  | { type: BridgeEventType.ToolStart; taskId: string; toolName: string; args: unknown }
  | { type: BridgeEventType.ToolUpdate; taskId: string; toolName: string; partialResult: unknown }
  | { type: BridgeEventType.ToolEnd; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: BridgeEventType.Done; taskId: string; text: string; bridgeSession?: BridgeSessionRecordRef | null }
  | { type: BridgeEventType.Error; taskId?: string; message: string };
