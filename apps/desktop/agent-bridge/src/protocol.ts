import type { AgentToolName } from "./agent-contract.js";

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
  type: "start_task";
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
  type: "answer_question";
  taskId: string;
  questionId: string;
  answer: string;
};

export type ChatMessageInput = {
  role: string;
  content: string;
};

export type ChatCommand = {
  type: "chat";
  provider: ProviderInput;
  model: ModelInput;
  systemPrompt: string;
  messages: ChatMessageInput[];
};

export type ChatResult = {
  type: "chat_result";
  text: string;
  thinking?: string | null;
};

export type BridgeCommand = StartTaskCommand | AnswerQuestionCommand | ChatCommand;

export type AskUserOption = {
  value: string;
  label: string;
  description?: string;
};

export type AskUserInput = {
  type: "text" | "select";
  label?: string;
  options?: AskUserOption[];
  selected?: string;
};

export type BridgeEvent =
  | { type: "started"; taskId: string }
  | {
    type: "question";
    taskId: string;
    questionId: string;
    question: string;
    context?: string | null;
    input?: AskUserInput;
  }
  | { type: "question_answered"; taskId: string; questionId: string; answer: string }
  | { type: "replace_text"; taskId: string; text: string }
  | { type: "text_delta"; taskId: string; delta: string }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "thinking_end"; taskId: string; content: string }
  | { type: "tool_start"; taskId: string; toolName: string; args: unknown }
  | { type: "tool_update"; taskId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: "done"; taskId: string; text: string }
  | { type: "error"; taskId?: string; message: string };
