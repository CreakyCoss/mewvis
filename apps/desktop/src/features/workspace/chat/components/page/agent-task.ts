import type { AgentRuntimeAgentEvent } from "@/ai/agent-runtime/contracts";
import type { AgentMemoryTrace } from "@/ai/agent-runtime/memory";
import type { PendingAgentQuestion } from "../../page-types";
import type {
  ChatContextSummary,
  ChatMessage,
  ChatTraceTurn,
  ConversationMessage,
} from "../../types";

export type RunningAgentTaskContext = {
  taskId: string;
  workspacePath: string;
  sessionId: string;
  title: string;
  messageId: string;
  traceTurnId: string;
  chatTrace: ChatTraceTurn[];
  agentSessionId: string;
  agentId: string;
  trace: AgentMemoryTrace;
  messages: ChatMessage[];
  conversation: ConversationMessage[];
  context: ChatContextSummary | null;
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
