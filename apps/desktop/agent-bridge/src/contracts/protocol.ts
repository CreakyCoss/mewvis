import type { AgentToolName } from "../tools/definitions.js";
import type { BridgeAgentDefinition } from "../runtimes/agents.js";
import type { RuntimeModelInput } from "./model.js";
import type { AskUserInput } from "../tools/types.js";

export enum BridgeCommandType {
  StartTask = "start_task",
  AnswerQuestion = "answer_question",
  Chat = "chat",
  ListAgents = "list_agents",
  Ping = "ping",
  Shutdown = "shutdown",
}

export enum BridgeResultType {
  AgentDefinitions = "agent_definitions",
  ChatResult = "chat_result",
  Pong = "pong",
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

export type StartTaskCommand = {
  type: BridgeCommandType.StartTask;
  requestId?: string | null;
  agentId?: string | null;
  taskId: string;
  workspacePath: string;
  chatSessionId?: string | null;
  prompt: string;
  bootstrapContext?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: AgentToolName[];
  bundledSkillsPath?: string | string[] | null;
  skillPaths?: string[];
  enabledSkills?: string[];
};

export type AnswerQuestionCommand = {
  type: BridgeCommandType.AnswerQuestion;
  requestId?: string | null;
  taskId: string;
  questionId: string;
  answer: string;
};

export type ListAgentsCommand = {
  type: BridgeCommandType.ListAgents;
  requestId?: string | null;
};

export type ChatMessageInput = {
  role: string;
  content: string;
};

export type ChatCommand = {
  type: BridgeCommandType.Chat;
  requestId?: string | null;
  agentId?: string | null;
  streamId?: string | null;
  stream?: boolean;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt: string;
  messages: ChatMessageInput[];
};

export type ChatResult = {
  type: BridgeResultType.ChatResult;
  requestId?: string | null;
  text: string;
  thinking?: string | null;
};

export type AgentDefinitionsResult = {
  type: BridgeResultType.AgentDefinitions;
  requestId?: string | null;
  defaultAgentId: string;
  agents: readonly BridgeAgentDefinition[];
};

export type PingCommand = {
  type: BridgeCommandType.Ping;
  requestId?: string | null;
};

export type ShutdownCommand = {
  type: BridgeCommandType.Shutdown;
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

export type BridgeCommand =
  | StartTaskCommand
  | AnswerQuestionCommand
  | ChatCommand
  | ListAgentsCommand
  | PingCommand
  | ShutdownCommand;

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
  | { type: BridgeEventType.Done; taskId: string; text: string }
  | { type: BridgeEventType.Error; taskId?: string; message: string };
