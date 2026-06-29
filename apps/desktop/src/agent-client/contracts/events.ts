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

export type AgentClientCollaborationStepResult = {
  stepId: string;
  stepType: "agent" | "dispatch" | "transform" | "condition" | "router";
  outputKey: string;
  output: unknown;
  text: string;
  agentRoleId?: string;
  agentTaskId?: string;
  route?: string | null;
};

export type AgentClientCollaborationSkippedStepResult = {
  stepId: string;
  reason: string;
  condition?: unknown;
};

export type AgentClientCollaborationResult = {
  workflowRunId: string;
  executorId?: string;
  mode?: string | null;
  steps: AgentClientCollaborationStepResult[];
  skippedSteps?: AgentClientCollaborationSkippedStepResult[];
  output?: unknown;
};

export type AgentClientCollaborationEvent =
  | {
    type: "workflow_started";
    taskId: string;
    workflowRunId: string;
    workflowId: string;
    executorId: string;
  }
  | {
    type: "step_started";
    taskId: string;
    workflowRunId: string;
    stepId: string;
    stepType: "agent" | "dispatch" | "transform" | "condition" | "router";
    agentRoleId?: string;
    agentTaskId?: string;
  }
  | {
    type: "agent_event";
    taskId: string;
    workflowRunId: string;
    stepId: string;
    agentRoleId: string;
    agentTaskId: string;
    event: { type: string; [key: string]: unknown };
  }
  | {
    type: "step_done";
    taskId: string;
    workflowRunId: string;
    step: AgentClientCollaborationStepResult;
  }
  | {
    type: "step_skipped";
    taskId: string;
    workflowRunId: string;
    step: AgentClientCollaborationSkippedStepResult;
  }
  | {
    type: "workflow_done";
    taskId: string;
    workflowRunId: string;
    result: AgentClientCollaborationResult;
  }
  | {
    type: "collaboration_result";
    taskId: string;
    requestId?: string | null;
    workflowRunId: string;
    executorId?: string;
    mode?: string | null;
    steps: AgentClientCollaborationStepResult[];
    skippedSteps?: AgentClientCollaborationSkippedStepResult[];
    output?: unknown;
  };

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
  | AgentClientCollaborationEvent
  | { type: "stderr"; taskId: string; message: string }
  | { type: "exit"; taskId: string; success: boolean; code: number | null }
  | { type: "error"; taskId?: string; message: string; raw?: string };

export type AgentClientChatEvent = AgentClientDeltaEvent & {
  streamId: string;
};
