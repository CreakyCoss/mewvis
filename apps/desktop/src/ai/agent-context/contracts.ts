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

export type AgentConversationSyncMessage = {
  id: string;
  role: ConversationRole;
  contentHash: string;
  timestamp: number;
};

export type AgentSessionFingerprint = {
  latestSessionFile?: string | null;
  sessionFileCount: number;
  totalBytes: number;
  messageCount: number;
  compactionCount: number;
};

export type AgentSessionContextStatus = AgentSessionFingerprint & {
  exists: boolean;
};

export type AgentConversationSync = {
  sessionId: string;
  agentId?: string | null;
  syncedMessages: AgentConversationSyncMessage[];
  updatedAt: number;
  lastRunStatus: ConversationRunStatus;
  lastSyncedMessageId?: string | null;
  invalidatedAt?: number | null;
  sessionFingerprint?: AgentSessionFingerprint | null;
};

export type ConversationSummaryFingerprint = {
  summarizedUntilIndex: number;
  contentHash: string;
};

export type ContextRagIndexSnapshot = {
  indexId: string;
  version: number;
  status: "missing" | "building" | "ready" | "stale" | "error";
  updatedAt?: number | null;
  sourceFingerprint?: string | null;
  documentCount?: number | null;
  chunkCount?: number | null;
  metadata?: Record<string, unknown>;
};

export type ContextMemoryLayerSnapshot = {
  layerId: string;
  kind: "conversation" | "document" | "agent" | "user" | "episodic" | "semantic";
  version: number;
  updatedAt: number;
  itemCount?: number | null;
  tokenCount?: number | null;
  sourceFingerprint?: string | null;
  metadata?: Record<string, unknown>;
};

export type ContextEngineState = {
  id: string;
  version: number;
  updatedAt: number;
  ragIndex?: ContextRagIndexSnapshot | null;
  memoryLayers?: ContextMemoryLayerSnapshot[];
  metadata?: Record<string, unknown>;
};

export type ChatContextSummary = {
  summary: string;
  summarizedUntilIndex: number;
  updatedAt: number;
  engine?: ContextEngineState | null;
  historyInvalidatedAt?: number | null;
  summaryFingerprint?: ConversationSummaryFingerprint | null;
  conversationFingerprint?: string | null;
  agentSyncs?: Record<string, AgentConversationSync>;
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
  syncStatus?: "fresh" | "stale";
  agentSessionId?: string | null;
};

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

export type ContextRagSourceType =
  | "document"
  | "conversation"
  | "memory"
  | "external";

export type ContextRagDocument = {
  id: string;
  sourceType: ContextRagSourceType;
  content: string;
  path?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
};

export type ContextRagQuery = {
  query: string;
  conversation: ConversationMessage[];
  references?: PromptFileReference[];
  maxResults?: number;
  metadata?: Record<string, unknown>;
};

export type ContextRagMatch = ContextRagDocument & {
  score?: number | null;
  chunkId?: string | null;
};

export type ContextRagIndex = {
  id: string;
  version: number;
  getSnapshot(): Promise<ContextRagIndexSnapshot | null> | ContextRagIndexSnapshot | null;
  search(input: ContextRagQuery): Promise<ContextRagMatch[]>;
  upsert?(documents: ContextRagDocument[]): Promise<void>;
  invalidate?(reason: "history_changed" | "source_changed" | "strategy_changed"): Promise<void>;
};

export type ContextEngineCapability =
  | "rolling_summary"
  | "agent_session_sync"
  | "rag_index"
  | "memory_layers";

export type ContextEngineDescriptor = {
  id: string;
  version: number;
  label: string;
  description: string;
  capabilities: ContextEngineCapability[];
  experimental?: boolean;
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

export type MemoryBackedRuntimeContextStats = {
  contextWindow: number;
  historyTokenBudget: number;
  historyTokensBefore: number;
  historyTokensAfter: number;
  summarizedMessageCount: number;
};

export type MemoryBackedRuntimeContextUpdate = {
  memory: string;
  summarizedMessageIds: string[];
  updatedAt: number;
};

export type PrepareMemoryBackedRuntimeContextInput<TState, TMessage> = {
  state: TState;
  messages: TMessage[];
  runtimeMessages: ConversationMessage[];
  currentMemory: string;
  summarizedMessageIds?: string[];
  contextWindow: number;
  maxTokens: number;
  staticTokens: number;
  minRecentHistoryTokens?: number;
  maxMemoryChars?: number;
  overflowNotice?: string;
  getMessageId: (message: TMessage) => string;
  summarizeMessages: (input: {
    previousMemory: string;
    messages: TMessage[];
  }) => Promise<string> | string;
  applyMemoryUpdate: (
    state: TState,
    update: MemoryBackedRuntimeContextUpdate,
  ) => TState;
};

export type PreparedMemoryBackedRuntimeContext<TState, TMessage> = {
  state: TState;
  messages: TMessage[];
  didCompress: boolean;
  warning?: string;
  stats: MemoryBackedRuntimeContextStats;
};

export type TokenBudgetModel = {
  contextWindow?: number;
  maxTokens?: number;
} | null | undefined;

export type NormalizableConversationMessage =
  | ConversationMessage
  | (Omit<ConversationMessage, "id"> & { id?: string });

type RuntimeContextSelectionInput = {
  engineId?: string | null;
  modelContext?: PromptContextModel | null;
  summarizer?: ConversationSummarizer | null;
  canUseModel?: boolean;
};

type ConversationContextInput = RuntimeContextSelectionInput & {
  conversation: ConversationMessage[];
  currentContext: ChatContextSummary | null;
  forceSummarize?: boolean;
  rebuildSummary?: boolean;
};

export type AgentContextApi = {
  DEFAULT_CONTEXT_ENGINE_ID: string;
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
  createContextPlan(input: RuntimeContextSelectionInput): RuntimeContextPlan;
  prepareConversationContext(input: ConversationContextInput): Promise<PreparedConversationContext>;
  compressConversationContext(input: ConversationContextInput): Promise<ChatContextSummary | null>;
  rebuildConversationContextAfterHistoryChange(
    input: ConversationContextInput,
  ): Promise<ChatContextSummary | null>;
  invalidateConversationContextAfterHistoryChange(input: {
    engineId?: string | null;
    context: ChatContextSummary | null;
    conversation: ConversationMessage[];
  }): ChatContextSummary;
  getActiveAgentRuntimeSessionId(input: {
    engineId?: string | null;
    context: ChatContextSummary | null | undefined;
    agentId?: string | null;
  }): string | null;
  selectConversationMessages(input: {
    engineId?: string | null;
    conversation: ConversationMessage[];
    context: ChatContextSummary | null;
    limits: PromptContextLimits;
  }): ConversationMessage[];
  planAgentRunContext(input: {
    engineId?: string | null;
    chatSessionId: string;
    conversation: ConversationMessage[];
    currentContext: ChatContextSummary | null;
    agentId?: string | null;
    tokenBudget?: number;
    isHistoryInvalidated?: boolean;
  }): AgentRunContextPlan;
  buildAgentRunContextPayload(input: {
    engineId?: string | null;
    conversation: ConversationMessage[];
    currentContext: ChatContextSummary | null;
    sessionPlan: AgentRunContextPlan;
    agentSessionStatus?: AgentSessionContextStatus | null;
    text: string;
    references: PromptFileReference[];
    knowledgeMatches?: PromptKnowledgeReference[];
    agentInstructions?: string | null;
    selectedAgent: PromptAgentProfile | null;
    limits: PromptContextLimits;
  }): AgentRunContextPayload;
  finalizeChatTurnContext(input: ConversationContextInput): Promise<ChatContextSummary | null>;
  finalizeAgentRunContext(input: {
    engineId?: string | null;
    conversation: ConversationMessage[];
    currentContext: ChatContextSummary | null;
    summarizer?: ConversationSummarizer | null;
    tokenBudget?: number;
    agentSessionId?: string | null;
    agentId?: string | null;
    runStatus: ConversationRunStatus;
    agentSessionStatus?: AgentSessionContextStatus | null;
  }): Promise<ChatContextSummary | null>;
  prepareMemoryBackedRuntimeContext<TState, TMessage>(
    input: PrepareMemoryBackedRuntimeContextInput<TState, TMessage>,
  ): Promise<PreparedMemoryBackedRuntimeContext<TState, TMessage>>;
  buildPromptContext(
    activeFile: PromptContextFile | null,
    referencedFiles: PromptFileReference[],
    activeSkills: PromptSkillContext[],
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
