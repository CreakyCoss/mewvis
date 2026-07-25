export type AskUserInputType = "text" | "select";

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

export enum AgentEventType {
  Started = "started",
  Question = "question",
  QuestionAnswered = "question_answered",
  ReplaceText = "replace_text",
  TextDelta = "text_delta",
  ThinkingDelta = "thinking_delta",
  ThinkingEnd = "thinking_end",
  ToolCallStart = "tool_call_start",
  ToolCallDelta = "tool_call_delta",
  ToolCallEnd = "tool_call_end",
  ToolExecutionStart = "tool_execution_start",
  ToolExecutionUpdate = "tool_execution_update",
  ToolExecutionEnd = "tool_execution_end",
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
  | {
      type: AgentEventType.ToolCallStart;
      taskId: string;
      toolCallId: string;
      toolName: string;
    }
  | {
      type: AgentEventType.ToolCallDelta;
      taskId: string;
      toolCallId: string;
      toolName: string;
      delta: string;
    }
  | {
      type: AgentEventType.ToolCallEnd;
      taskId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: AgentEventType.ToolExecutionStart;
      taskId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: AgentEventType.ToolExecutionUpdate;
      taskId: string;
      toolCallId: string;
      toolName: string;
      partialResult: unknown;
    }
  | {
      type: AgentEventType.ToolExecutionEnd;
      taskId: string;
      toolCallId: string;
      toolName: string;
      isError: boolean;
      result: unknown;
    }
  | { type: AgentEventType.Done; taskId: string; text: string; runtimeSession?: RuntimeSessionRecordRef | null }
  | { type: AgentEventType.Error; taskId?: string; message: string };
