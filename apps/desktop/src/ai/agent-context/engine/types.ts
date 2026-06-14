import type {
  ConversationSummarizer,
  RuntimeConversationContext,
} from "../core/conversation";
import type {
  AgentSessionContextStatus,
  ChatContextSummary,
  ContextEngineCapability,
  ConversationMessage,
  PromptAgentProfile,
  PromptFileReference,
  PromptKnowledgeReference,
} from "../core/types";
import type {
  PromptContextLimits,
  PromptContextModel,
} from "../prompt/prompts";
import type { ContextMemoryLayer } from "./memory-layers";
import type { ContextRagIndex } from "./rag";

export type ContextEngineServices = {
  ragIndex?: ContextRagIndex | null;
  memoryLayers?: ContextMemoryLayer[];
};

export type RuntimeContextModelSelection = {
  modelContext?: PromptContextModel | null;
  summarizer?: ConversationSummarizer | null;
  canUseModel?: boolean;
};

export type RuntimeContextPlan = {
  limits: PromptContextLimits;
  summarizer?: ConversationSummarizer;
};

export type PrepareRuntimeConversationContextInput =
  RuntimeContextModelSelection & {
    conversation: ConversationMessage[];
    currentContext: ChatContextSummary | null;
    forceSummarize?: boolean;
    rebuildSummary?: boolean;
  };

export type PreparedRuntimeConversationContext = RuntimeContextPlan & {
  context: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
};

export type AgentRunSessionPlan = {
  agentSessionId: string;
  promptHistory: RuntimeConversationContext;
  shouldStartFreshSession: boolean;
};

export type PlanAgentRunSessionInput = {
  chatSessionId: string;
  conversation: ConversationMessage[];
  currentContext: ChatContextSummary | null;
  agentId?: string | null;
  tokenBudget?: number;
  isHistoryInvalidated?: boolean;
};

export type BuildAgentRunPromptPayloadInput = {
  conversation: ConversationMessage[];
  currentContext: ChatContextSummary | null;
  sessionPlan: AgentRunSessionPlan;
  agentSessionStatus?: AgentSessionContextStatus | null;
  text: string;
  references: PromptFileReference[];
  knowledgeMatches?: PromptKnowledgeReference[];
  agentInstructions?: string | null;
  selectedAgent: PromptAgentProfile | null;
  limits: PromptContextLimits;
};

export type AgentRunPromptPayload = {
  bootstrapContext: string;
  prompt: string;
  shouldBootstrapAgentContext: boolean;
  bootstrapHistory: RuntimeConversationContext;
  promptHistory: RuntimeConversationContext;
};

export type FinalizeAgentRunContextInput = {
  conversation: ConversationMessage[];
  currentContext: ChatContextSummary | null;
  summarizer?: ConversationSummarizer | null;
  tokenBudget?: number;
  agentSessionId?: string | null;
  agentId?: string | null;
  runStatus: "done" | "error";
  agentSessionStatus?: AgentSessionContextStatus | null;
};

export type FinalizeChatTurnContextInput = PrepareRuntimeConversationContextInput;

export type ContextEngine = {
  id: string;
  version: number;
  label: string;
  description: string;
  capabilities: ContextEngineCapability[];
  experimental?: boolean;
  services?: ContextEngineServices;
  createPlan(input: RuntimeContextModelSelection): RuntimeContextPlan;
  prepareConversation(
    input: PrepareRuntimeConversationContextInput,
  ): Promise<PreparedRuntimeConversationContext>;
  selectConversationMessages(
    conversation: ConversationMessage[],
    context: ChatContextSummary | null,
    limits: PromptContextLimits,
  ): ConversationMessage[];
  compressConversation(
    input: PrepareRuntimeConversationContextInput,
  ): Promise<ChatContextSummary | null>;
  rebuildAfterHistoryChange(
    input: PrepareRuntimeConversationContextInput,
  ): Promise<ChatContextSummary | null>;
  invalidateAfterHistoryChange(
    context: ChatContextSummary | null,
    conversation: ConversationMessage[],
  ): ChatContextSummary;
  getActiveAgentRuntimeSessionId(
    context: ChatContextSummary | null | undefined,
    agentId?: string | null,
  ): string | null;
  planAgentRun(input: PlanAgentRunSessionInput): AgentRunSessionPlan;
  buildAgentPromptPayload(input: BuildAgentRunPromptPayloadInput): AgentRunPromptPayload;
  finalizeChatTurn(input: FinalizeChatTurnContextInput): Promise<ChatContextSummary | null>;
  finalizeAgentRun(input: FinalizeAgentRunContextInput): Promise<ChatContextSummary | null>;
};

export type ContextEngineFactoryOptions = {
  id?: string;
  version?: number;
  label?: string;
  description?: string;
  capabilities?: ContextEngineCapability[];
  experimental?: boolean;
  services?: ContextEngineServices;
  metadata?: Record<string, unknown>;
};
