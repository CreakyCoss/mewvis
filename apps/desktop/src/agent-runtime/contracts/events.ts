export type AgentRuntimeAgentQuestionInput = {
  type: "text" | "select";
  label?: string;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  selected?: string;
};

export type AgentRuntimeTextDeltaEvent = {
  type: "text_delta";
  delta: string;
};

export type AgentRuntimeThinkingDeltaEvent = {
  type: "thinking_delta";
  delta: string;
};

export type AgentRuntimeDeltaEvent =
  | AgentRuntimeTextDeltaEvent
  | AgentRuntimeThinkingDeltaEvent;

export type AgentRuntimeAgentEvent =
  | { type: "started"; taskId: string }
  | {
    type: "question";
    taskId: string;
    questionId: string;
    question: string;
    context?: string | null;
    input?: AgentRuntimeAgentQuestionInput;
  }
  | { type: "question_answered"; taskId: string; questionId: string; answer: string }
  | { type: "replace_text"; taskId: string; text: string }
  | (AgentRuntimeDeltaEvent & { taskId: string })
  | { type: "thinking_end"; taskId: string; content: string }
  | { type: "tool_start"; taskId: string; toolName: string; args: unknown }
  | { type: "tool_update"; taskId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: "done"; taskId: string; text: string }
  | { type: "stderr"; taskId: string; message: string }
  | { type: "exit"; taskId: string; success: boolean; code: number | null }
  | { type: "error"; taskId?: string; message: string; raw?: string };

export type AgentRuntimeChatEvent = AgentRuntimeDeltaEvent & {
  streamId: string;
};
