import type {
  ChatContextSummary,
  ConversationMessage,
  ConversationSummarizer,
  RuntimeConversationContext,
} from "./context";

export type PromptContextModel = {
  contextWindow?: number;
  maxTokens?: number;
};

export type PromptContextLimits = {
  activeFileChars: number;
  referenceFileChars: number;
  totalReferenceChars: number;
  skillChars: number;
  totalSkillChars: number;
  summaryChars: number;
  recentHistoryChars: number;
  recentHistoryTokens: number;
};

export type PromptFileReference = {
  path: string;
  content: string;
};

export type PromptReference = PromptFileReference;

export type ReferencePromptLimits = {
  perFileChars?: number;
  totalChars?: number;
  query?: string;
};

export type PromptAgentProfile = {
  id?: string;
  name: string;
  description?: string | null;
};

export type PromptSkillContext = {
  name: string;
  content: string;
  description?: string | null;
};

export type PromptContextFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};

export type PromptKnowledgeReference = {
  id: string;
  content: string;
  path?: string | null;
  title?: string | null;
  score?: number | null;
  chunkId?: string | null;
  metadata?: Record<string, unknown>;
};

export type BuildPromptContextOptions = {
  limits?: PromptContextLimits;
  conversationSummary?: string;
  executionMemorySummary?: string;
  contextQuery?: string;
  knowledgeMatches?: PromptKnowledgeReference[];
};

export type RuntimeContextPlan = {
  limits: PromptContextLimits;
  summarizer?: ConversationSummarizer;
};

export type PreparedConversationContext = RuntimeContextPlan & {
  context: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
};

export type AgentRunContextPlan = {
  agentSessionId: string;
  shouldStartFreshSession: boolean;
  readonly __contextPlan?: unknown;
};

export type AgentRunContextPayload = {
  bootstrapContext: string;
  prompt: string;
  shouldBootstrapAgentContext: boolean;
  bootstrapHistory: RuntimeConversationContext;
  promptHistory: RuntimeConversationContext;
};
