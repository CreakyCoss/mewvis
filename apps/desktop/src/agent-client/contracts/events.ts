import type { AskUserInput, CollaborationRunResult, RuntimeSessionRecordRef } from "@agent-runtime/engines/protocol";

export type AgentClientTextDeltaEvent = {
  type: "text_delta";
  delta: string;
};

export type AgentClientThinkingDeltaEvent = {
  type: "thinking_delta";
  delta: string;
};

export type AgentClientDeltaEvent = AgentClientTextDeltaEvent | AgentClientThinkingDeltaEvent;

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
  runtimeSession?: RuntimeSessionRecordRef | null;
};

export type AgentClientOutputEvent =
  AgentClientDeltaEvent | AgentClientReplaceTextEvent | AgentClientThinkingEndEvent | AgentClientDoneEvent;

export type AgentClientCollaborationStepResult = CollaborationRunResult["steps"][number];

export type AgentClientCollaborationSkippedStepResult = NonNullable<CollaborationRunResult["skippedSteps"]>[number];

export type AgentClientCollaborationResult = CollaborationRunResult & {
  mode?: string | null;
};

export type AgentClientCollaborationEvent =
  | {
      type: "workflow_started";
      taskId: string;
      workflowRunId: string;
      workflowId: string;
    }
  | {
      type: "step_started";
      taskId: string;
      workflowRunId: string;
      stepId: string;
      stepType: AgentClientCollaborationStepResult["stepType"];
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
      event: AgentClientRuntimeAgentEvent;
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
      mode?: string | null;
      steps: AgentClientCollaborationStepResult[];
      skippedSteps?: AgentClientCollaborationSkippedStepResult[];
      output?: unknown;
    };

export type AgentClientTransportEvent =
  | {
      type: "state";
      taskId: string;
      taskState: string;
      workerState: string;
      workerId?: string;
      sessionKey?: string;
      queueDepth?: number;
    }
  | { type: "stderr"; taskId: string; message: string }
  | { type: "exit"; taskId: string; success: boolean; code: number | null };

export type AgentClientRuntimeAgentEvent =
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
  | (AgentClientOutputEvent & { taskId: string })
  | { type: "tool_call_start"; taskId: string; toolCallId: string; toolName: string }
  | { type: "tool_call_delta"; taskId: string; toolCallId: string; toolName: string; delta: string }
  | { type: "tool_call_end"; taskId: string; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_start"; taskId: string; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool_execution_update";
      taskId: string;
      toolCallId: string;
      toolName: string;
      partialResult: unknown;
    }
  | {
      type: "tool_execution_end";
      taskId: string;
      toolCallId: string;
      toolName: string;
      isError: boolean;
      result: unknown;
    }
  | { type: "error"; taskId?: string; message: string; raw?: string };

export type AgentClientAgentEvent =
  AgentClientRuntimeAgentEvent | AgentClientCollaborationEvent | AgentClientTransportEvent;

export type AgentClientChatEvent = AgentClientDeltaEvent & {
  streamId: string;
};

export type AgentClientChatOutputHandlers = {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};
