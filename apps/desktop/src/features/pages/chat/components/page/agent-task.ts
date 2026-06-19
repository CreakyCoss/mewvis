import type { AgentRuntimeAgentEvent } from "@/ai/agent-runtime/contracts";
import type { PendingAgentQuestion } from "../../page-types";
import type {
  ChatMessage,
} from "../../types";

export type RunningAgentTaskContext = {
  taskId: string;
  workspacePath: string;
  sessionId: string;
  title: string;
  messageId: string;
  agentSessionId: string;
  agentId: string;
  messages: ChatMessage[];
  pendingQuestion: PendingAgentQuestion | null;
  questionAnswer: string;
  customQuestionAnswer: string;
  lastError: string;
  lastStderr: string;
  handledTerminal: boolean;
};

export const pendingQuestionFromEvent = (
  event: Extract<AgentRuntimeAgentEvent, { type: "question" }>,
): PendingAgentQuestion => ({
  taskId: event.taskId,
  questionId: event.questionId,
  question: event.question,
  context: event.context,
  input: event.input,
});
