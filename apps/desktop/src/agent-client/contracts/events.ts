import type { AgentClientSession } from "./session";

export type AgentClientAgentQuestionInput = {
  type: "text" | "select";
  label?: string;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  selected?: string;
};

export type AgentClientTextDeltaEvent = {
  type: "text_delta";
  delta: string;
};

export type AgentClientThinkingDeltaEvent = {
  type: "thinking_delta";
  delta: string;
};

export type AgentClientDeltaEvent =
  | AgentClientTextDeltaEvent
  | AgentClientThinkingDeltaEvent;

export type AgentClientReplaceTextEvent = {
  type: "replace_text";
  text: string;
};

export type AgentClientThinkingEndEvent = {
  type: "thinking_end";
  content: string;
};

export type AgentClientDoneEvent = {
  type: "done";
  text: string;
  agentSession?: AgentClientSession | null;
};

export type AgentClientOutputEvent =
  | AgentClientDeltaEvent
  | AgentClientReplaceTextEvent
  | AgentClientThinkingEndEvent
  | AgentClientDoneEvent;

export type AgentClientAgentEvent =
  | {
    type: "state";
    taskId: string;
    taskState: string;
    workerState: string;
    workerId?: string;
    sessionKey?: string;
    queueDepth?: number;
  }
  | { type: "started"; taskId: string }
  | {
    type: "question";
    taskId: string;
    questionId: string;
    question: string;
    context?: string | null;
    input?: AgentClientAgentQuestionInput;
  }
  | { type: "question_answered"; taskId: string; questionId: string; answer: string }
  | (AgentClientOutputEvent & { taskId: string })
  | { type: "tool_start"; taskId: string; toolName: string; args: unknown }
  | { type: "tool_update"; taskId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: "stderr"; taskId: string; message: string }
  | { type: "exit"; taskId: string; success: boolean; code: number | null }
  | { type: "error"; taskId?: string; message: string; raw?: string };

export type AgentClientChatEvent = AgentClientDeltaEvent & {
  streamId: string;
};
