import {
  DEFAULT_CONVERSATION_TOKEN_BUDGET,
  findConversationTailStartByTokenBudget,
} from "./token-budget";

export type ConversationRole = "user" | "assistant";

export type ConversationRunStatus = "done" | "error";

export type ConversationMessageMetadata = {
  executionSummary?: string;
  runStatus?: ConversationRunStatus;
  runtimeSessionId?: string | null;
};

export type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: number;
  metadata?: ConversationMessageMetadata | null;
};

export type ChatContextSummary = {
  summary: string;
  summarizedUntilIndex: number;
  updatedAt: number;
};

export type ConversationSummaryInput = {
  previousSummary: string;
  messages: ConversationMessage[];
};

export type ConversationSummarizer = (
  input: ConversationSummaryInput,
) => Promise<string>;

export type RuntimeConversationContext = {
  summary: string;
  recentMessages: ConversationMessage[];
};

export const EMPTY_RUNTIME_CONVERSATION_CONTEXT: RuntimeConversationContext = {
  summary: "",
  recentMessages: [],
};

const roleLabel = (role: ConversationMessage["role"]) =>
  role === "user" ? "用户" : "助手";

const hashString = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

const legacyConversationMessageId = (
  message: Omit<ConversationMessage, "id"> & { id?: string },
  index: number,
) => [
  "legacy",
  message.timestamp || index,
  index,
  hashString(`${message.role}\n${message.content}`),
].join("-");

const normalizeConversationMessageMetadata = (
  metadata: unknown,
): ConversationMessage["metadata"] => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidate = metadata as Partial<NonNullable<ConversationMessage["metadata"]>> & {
    agentExecutionSummary?: unknown;
    agentRunStatus?: unknown;
    agentSessionId?: unknown;
  };
  const normalized: NonNullable<ConversationMessage["metadata"]> = {};
  const executionSummary = typeof candidate.executionSummary === "string"
    ? candidate.executionSummary
    : typeof candidate.agentExecutionSummary === "string"
      ? candidate.agentExecutionSummary
      : "";
  if (executionSummary) {
    normalized.executionSummary = executionSummary;
  }
  const runStatus = candidate.runStatus ?? candidate.agentRunStatus;
  if (runStatus === "done" || runStatus === "error") {
    normalized.runStatus = runStatus;
  }
  const runtimeSessionId = candidate.runtimeSessionId ?? candidate.agentSessionId;
  if (typeof runtimeSessionId === "string" || runtimeSessionId === null) {
    normalized.runtimeSessionId = runtimeSessionId;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
};

export const normalizeConversationMessages = (
  conversation: Array<ConversationMessage | (Omit<ConversationMessage, "id"> & { id?: string })>,
) => conversation.map((message, index) => ({
  ...message,
  id: message.id?.trim() || legacyConversationMessageId(message, index),
  metadata: normalizeConversationMessageMetadata(message.metadata),
}));

export const formatConversationForSummary = (messages: ConversationMessage[]) =>
  messages
    .map((message) => `${roleLabel(message.role)}：${message.content}`)
    .join("\n\n");

export const buildRuntimeConversationContext = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
  tokenBudget = DEFAULT_CONVERSATION_TOKEN_BUDGET,
): RuntimeConversationContext => {
  const summarizedUntilIndex = context?.summary
    ? Math.min(Math.max(0, context.summarizedUntilIndex), conversation.length)
    : 0;
  const unsummarizedMessages = conversation.slice(summarizedUntilIndex);
  const recentStart = findConversationTailStartByTokenBudget(
    unsummarizedMessages,
    tokenBudget,
  );

  return {
    summary: context?.summary ?? "",
    recentMessages: unsummarizedMessages.slice(recentStart),
  };
};

export const buildRuntimeConversationMessages = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
  tokenBudget = DEFAULT_CONVERSATION_TOKEN_BUDGET,
): ConversationMessage[] => buildRuntimeConversationContext(
  conversation,
  context,
  tokenBudget,
).recentMessages;
