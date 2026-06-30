import type { AskUserInput } from "../tools/types.js";

export enum AgentEventType {
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

export type RuntimeSessionRecordRef = {
  sessionRootDir: string;
  userMessageRecordId?: string | null;
  requestContextRecordId?: string | null;
  runtimeInstructionRecordId?: string | null;
  assistantMessageRecordId?: string | null;
};

export type AgentEvent =
  | { type: AgentEventType.Started; taskId: string }
  | {
    type: AgentEventType.Question;
    taskId: string;
    questionId: string;
    question: string;
    context?: string | null;
    input?: AskUserInput;
  }
  | { type: AgentEventType.QuestionAnswered; taskId: string; questionId: string; answer: string }
  | { type: AgentEventType.ReplaceText; taskId: string; text: string }
  | { type: AgentEventType.TextDelta; taskId: string; delta: string }
  | { type: AgentEventType.ThinkingDelta; taskId: string; delta: string }
  | { type: AgentEventType.ThinkingEnd; taskId: string; content: string }
  | { type: AgentEventType.ToolStart; taskId: string; toolName: string; args: unknown }
  | { type: AgentEventType.ToolUpdate; taskId: string; toolName: string; partialResult: unknown }
  | { type: AgentEventType.ToolEnd; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: AgentEventType.Done; taskId: string; text: string; runtimeSession?: RuntimeSessionRecordRef | null }
  | { type: AgentEventType.Error; taskId?: string; message: string };
