import type {
  AgentSessionContextStatus,
  ChatContextSummary,
  ConversationMessage,
  ConversationRunStatus,
  ConversationSummarizer,
  RuntimeConversationContext,
} from "./context";
import type { ContextEngineDescriptor } from "./descriptor";
import type {
  PreparedMemoryBackedRuntimeContext,
  PrepareMemoryBackedRuntimeContextInput,
} from "./memory";
import type {
  BuildPromptContextOptions,
  PromptAgentProfile,
  PromptContextFile,
  PromptContextLimits,
  PromptContextModel,
  PromptFileReference,
  PromptKnowledgeReference,
  PromptReference,
  ReferencePromptLimits,
} from "./prompt";

export type TokenBudgetModel = {
  contextWindow?: number;
  maxTokens?: number;
} | null | undefined;

export type NormalizableConversationMessage =
  | ConversationMessage
  | (Omit<ConversationMessage, "id"> & { id?: string });

export type AgentContextRuntimeInput = {
  engineId?: string | null;
  modelContext?: PromptContextModel | null;
  summarizer?: ConversationSummarizer | null;
  canUseModel?: boolean;
};

export type AgentContextSessionSetInput = AgentContextRuntimeInput & {
  context?: ChatContextSummary | null;
};

export type AgentContextSessionManagerSnapshot = {
  engineId: string | null;
  context: ChatContextSummary | null;
  modelContext: PromptContextModel | null;
  summarizer: ConversationSummarizer | null;
  canUseModel: boolean;
};

export type AgentContextSessionManager = {
  get(): AgentContextSessionManagerSnapshot;
  set(input: AgentContextSessionSetInput): void;
  getContext(): ChatContextSummary | null;
  setContext(context: ChatContextSummary | null): ChatContextSummary | null;
  getSummary(): string;
};

export type CreateAgentContextSessionManagerInput = AgentContextSessionSetInput;

export type CreateAgentContextSessionInput = AgentContextSessionSetInput & {
  manager?: AgentContextSessionManager;
};

export type PreparedConversationContext = {
  limits: PromptContextLimits;
  context: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
};

export type PreparedAgentRunContext = {
  agentSessionId: string;
  bootstrapContext: string;
  prompt: string;
  shouldBootstrapAgentContext: boolean;
  bootstrapHistory: RuntimeConversationContext;
  promptHistory: RuntimeConversationContext;
};

export type AgentContextSession = {
  set(input: AgentContextSessionSetInput): void;
  get(): ChatContextSummary | null;
  getSummary(): string;
  getActiveAgentRuntimeSessionId(agentId?: string | null): string | null;
  getContextLimits(input?: AgentContextRuntimeInput): PromptContextLimits;
  prepareConversation(input: {
    conversation: ConversationMessage[];
    forceSummarize?: boolean;
    rebuildSummary?: boolean;
  }): Promise<PreparedConversationContext>;
  compressConversation(input: {
    conversation: ConversationMessage[];
    forceSummarize?: boolean;
    rebuildSummary?: boolean;
  }): Promise<ChatContextSummary | null>;
  rebuildAfterHistoryChange(input: {
    conversation: ConversationMessage[];
  }): Promise<ChatContextSummary | null>;
  invalidateAfterHistoryChange(input: {
    conversation: ConversationMessage[];
  }): ChatContextSummary;
  selectRecentConversation(input: {
    conversation: ConversationMessage[];
    limits: PromptContextLimits;
  }): ConversationMessage[];
  prepareAgentRun(input: {
    chatSessionId: string;
    conversation: ConversationMessage[];
    agentId?: string | null;
    tokenBudget?: number;
    isHistoryInvalidated?: boolean;
    text: string;
    references: PromptFileReference[];
    knowledgeMatches?: PromptKnowledgeReference[];
    agentInstructions?: string | null;
    selectedAgent: PromptAgentProfile | null;
    limits: PromptContextLimits;
    loadAgentSessionStatus?: (
      agentSessionId: string,
    ) => AgentSessionContextStatus | null | Promise<AgentSessionContextStatus | null>;
  }): Promise<PreparedAgentRunContext>;
  finalizeChatTurn(input: {
    conversation: ConversationMessage[];
    forceSummarize?: boolean;
    rebuildSummary?: boolean;
  }): Promise<ChatContextSummary | null>;
  finalizeAgentRun(input: {
    conversation: ConversationMessage[];
    tokenBudget?: number;
    agentSessionId?: string | null;
    agentId?: string | null;
    runStatus: ConversationRunStatus;
    agentSessionStatus?: AgentSessionContextStatus | null;
  }): Promise<ChatContextSummary | null>;
};

export type AgentContextApi = {
  DEFAULT_CONTEXT_ENGINE_ID: string;
  createSessionManager(
    input?: CreateAgentContextSessionManagerInput,
  ): AgentContextSessionManager;
  createSession(input?: CreateAgentContextSessionInput): AgentContextSession;
  formatConversationForSummary(messages: ConversationMessage[]): string;
  normalizeChatContextSummary(
    context: ChatContextSummary | null | undefined,
  ): ChatContextSummary | null;
  normalizeConversationMessages(
    conversation: NormalizableConversationMessage[],
  ): ConversationMessage[];
  countTextTokens(text: string): number;
  resolveAppContextWindow(model?: TokenBudgetModel): number;
  getContextEngineDescriptor(engineId?: string | null): ContextEngineDescriptor;
  listContextEngineDescriptors(): ContextEngineDescriptor[];
  prepareMemoryBackedRuntimeContext<TState, TMessage>(
    input: PrepareMemoryBackedRuntimeContextInput<TState, TMessage>,
  ): Promise<PreparedMemoryBackedRuntimeContext<TState, TMessage>>;
  buildPromptContext(
    activeFile: PromptContextFile | null,
    referencedFiles: PromptFileReference[],
    activeSkills: import("./prompt").PromptSkillContext[],
    selectedAgent: PromptAgentProfile | null,
    options?: BuildPromptContextOptions,
  ): string;
  appendReferencesToPrompt(
    text: string,
    references: PromptReference[],
    limits?: ReferencePromptLimits,
  ): string;
  formatReferencesForPrompt(
    references: PromptReference[],
    limits?: ReferencePromptLimits,
  ): string;
};
