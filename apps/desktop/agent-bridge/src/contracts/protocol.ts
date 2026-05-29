import type { AgentToolName } from "./tools.js";

export enum BridgeCommandType {
  StartTask = "start_task",
  AnswerQuestion = "answer_question",
  Chat = "chat",
}

export enum BridgeResultType {
  ChatResult = "chat_result",
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

export enum AskUserInputType {
  Text = "text",
  Select = "select",
}

export type ProviderInput = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
};

export type ModelInput = {
  id: string;
  modelId: string;
  modelName: string;
  baseUrl?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: Array<"text" | "image">;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  compat?: unknown;
};

export type StartTaskCommand = {
  type: BridgeCommandType.StartTask;
  bridgeAgentId?: string | null;
  taskId: string;
  workspacePath: string;
  prompt: string;
  provider: ProviderInput;
  model: ModelInput;
  allowedTools?: AgentToolName[];
  bundledSkillsPath?: string | string[] | null;
  skillPaths?: string[];
  enabledSkills?: string[];
};

export type AnswerQuestionCommand = {
  type: BridgeCommandType.AnswerQuestion;
  taskId: string;
  questionId: string;
  answer: string;
};

export type ChatMessageInput = {
  role: string;
  content: string;
};

export type ChatCommand = {
  type: BridgeCommandType.Chat;
  bridgeAgentId?: string | null;
  streamId?: string | null;
  stream?: boolean;
  provider: ProviderInput;
  model: ModelInput;
  systemPrompt: string;
  messages: ChatMessageInput[];
};

export type ChatResult = {
  type: BridgeResultType.ChatResult;
  text: string;
  thinking?: string | null;
};

export type AgentRunResult = {
  text: string;
};

export type BridgeCommand = StartTaskCommand | AnswerQuestionCommand | ChatCommand;

export type AskUserOption = {
  value: string;
  label: string;
  description?: string;
};

export type AskUserInput = {
  type: AskUserInputType;
  label?: string;
  options?: AskUserOption[];
  selected?: string;
};

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
