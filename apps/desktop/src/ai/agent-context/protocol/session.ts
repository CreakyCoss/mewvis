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
  PromptSkillContext,
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

export type AgentContextSessionSetInput = AgentContextRuntimeInput &
  AgentContextSessionAdapterInput & {
  chatId?: string | null;
  context?: ChatContextSummary | null;
};

export type AgentContextSessionStateSnapshot = {
  engineId: string | null;
  context: ChatContextSummary | null;
  modelContext: PromptContextModel | null;
  summarizer: ConversationSummarizer | null;
  canUseModel: boolean;
};

export type AgentContextSessionStateManager = {
  get(): AgentContextSessionStateSnapshot;
  set(input: AgentContextSessionSetInput): void;
  getContext(): ChatContextSummary | null;
  setContext(context: ChatContextSummary | null): ChatContextSummary | null;
  getSummary(): string;
};

export type CreateAgentContextSessionStateManagerInput = AgentContextSessionSetInput;

export type AgentContextSessionFileDescriptor = {
  path: string;
  content?: string | null;
  updatedAt?: number | null;
};

export type AgentContextSessionFileLoader = (
  file: AgentContextSessionFileDescriptor,
) =>
  | string
  | PromptFileReference
  | PromptContextFile
  | null
  | undefined
  | Promise<string | PromptFileReference | PromptContextFile | null | undefined>;

export type AgentContextSessionKnowledgeSearchInput = {
  chatId: string | null;
  query: string;
  conversation: ConversationMessage[];
  references: PromptFileReference[];
  activeFile: PromptContextFile | null;
};

export type AgentContextSessionKnowledgeSearch = (
  input: AgentContextSessionKnowledgeSearchInput,
) => PromptKnowledgeReference[] | Promise<PromptKnowledgeReference[]>;

export type AgentContextSessionTracePayload = {
  label: string;
  content: string;
  sourceLabel?: string;
  sourceDescription?: string;
};

export type AgentContextSessionTraceStepType =
  | "input"
  | "file"
  | "context"
  | "rag"
  | "request"
  | "response"
  | "error";

export type AgentContextSessionTraceStepStatus =
  | "pending"
  | "running"
  | "done"
  | "error";

export type AgentContextSessionTraceStep = {
  id: string;
  type: AgentContextSessionTraceStepType;
  label: string;
  startedAt: number;
  endedAt?: number | null;
  durationMs?: number | null;
  status?: AgentContextSessionTraceStepStatus;
  content?: string;
  metadata?: Record<string, unknown>;
  payloads?: AgentContextSessionTracePayload[];
};

export type AgentContextSessionTraceTurn = {
  id: string;
  status: "running" | "done" | "error";
  createdAt: number;
  updatedAt: number;
  chatId: string | null;
  userMessageId: string;
  assistantMessageId?: string | null;
  userText: string;
  referencedFilePaths: string[];
  activeFilePath?: string | null;
  engineId?: string | null;
  contextWindow?: number | null;
  conversationSummary?: string;
  steps: AgentContextSessionTraceStep[];
};

export type AgentContextPromptSystemPromptBuilderInput = {
  chatId: string | null;
  text: string;
  conversation: ConversationMessage[];
  context: ChatContextSummary | null;
  limits: PromptContextLimits;
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
  activeFile: PromptContextFile | null;
  references: PromptFileReference[];
  activeSkills: PromptSkillContext[];
  selectedAgent: PromptAgentProfile | null;
  knowledgeMatches: PromptKnowledgeReference[];
  contextQuery: string;
};

export type AgentContextPromptSystemPromptBuilder = (
  input: AgentContextPromptSystemPromptBuilderInput,
) => string | Promise<string>;

export type AgentContextPromptExecutorInput =
  AgentContextPromptSystemPromptBuilderInput & {
    turnId: string;
    systemPrompt: string;
    traceTurn: AgentContextSessionTraceTurn;
  };

export type AgentContextPromptExecutorResult = {
  text: string;
  thinking?: string | null;
  assistantMessages?: NormalizableConversationMessage[];
};

export type AgentContextPromptExecutor = (
  input: AgentContextPromptExecutorInput,
) => AgentContextPromptExecutorResult | Promise<AgentContextPromptExecutorResult>;

export type AgentContextSessionAdapterInput = {
  loadFile?: AgentContextSessionFileLoader;
  searchKnowledge?: AgentContextSessionKnowledgeSearch;
  buildSystemPrompt?: AgentContextPromptSystemPromptBuilder;
  runPrompt?: AgentContextPromptExecutor;
};

export type AgentContextSessionPromptInput = AgentContextRuntimeInput & {
  chatId?: string | null;
  id?: string;
  now?: number;
  text: string;
  conversation?: NormalizableConversationMessage[];
  activeFile?: AgentContextSessionFileDescriptor | PromptContextFile | null;
  references?: Array<AgentContextSessionFileDescriptor | PromptFileReference>;
  activeSkills?: PromptSkillContext[];
  selectedAgent?: PromptAgentProfile | null;
  knowledgeMatches?: PromptKnowledgeReference[];
  loadFile?: AgentContextSessionFileLoader;
  searchKnowledge?: AgentContextSessionKnowledgeSearch;
  executionMemorySummary?: string;
  contextQuery?: string;
  forceSummarize?: boolean;
  rebuildSummary?: boolean;
  systemPrompt?: string;
  buildSystemPrompt?: AgentContextPromptSystemPromptBuilder;
  runPrompt?: AgentContextPromptExecutor;
  execute?: boolean;
  appendAssistantMessage?: boolean;
  assistantMessageId?: string;
};

export type AgentContextSessionLoadResourcesInput = {
  activeFile?: AgentContextSessionFileDescriptor | PromptContextFile | null;
  references?: Array<AgentContextSessionFileDescriptor | PromptFileReference>;
  loadFile?: AgentContextSessionFileLoader;
};

export type AgentContextSessionLoadedResources = {
  activeFile: PromptContextFile | null;
  references: PromptFileReference[];
};

export type AgentContextSessionPromptResult = {
  turnId: string;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage | null;
  text: string;
  thinking?: string | null;
  systemPrompt: string;
  limits: PromptContextLimits;
  context: ChatContextSummary | null;
  previousContext: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  conversation: ConversationMessage[];
  conversationSummary: string;
  references: PromptFileReference[];
  activeFile: PromptContextFile | null;
  knowledgeMatches: PromptKnowledgeReference[];
  traceTurn: AgentContextSessionTraceTurn;
};

export type AgentContextSessionSnapshot = AgentContextSessionStateSnapshot & {
  chatId: string | null;
  conversation: ConversationMessage[];
  trace: AgentContextSessionTraceTurn[];
  lastPrompt: AgentContextSessionPromptResult | null;
};

export type CreateAgentContextSessionInput = AgentContextSessionSetInput & {
  chatId?: string | null;
  conversation?: NormalizableConversationMessage[];
  trace?: AgentContextSessionTraceTurn[];
  state?: AgentContextSessionStateManager;
  manager?: AgentContextSessionStateManager;
};

export type CreateAgentContextSessionManagerInput = CreateAgentContextSessionInput;

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

export type AgentContextSessionPrepareAgentTurnInput =
  AgentContextSessionPromptInput & {
    chatSessionId: string;
    agentSessionRoot?: "chats" | "tavern";
    agentConversation?: NormalizableConversationMessage[];
    agentContext?: ChatContextSummary | null;
    agentId?: string | null;
    tokenBudget?: number;
    isHistoryInvalidated?: boolean;
    agentInstructions?: string | null;
    selectedAgent: PromptAgentProfile | null;
    limits?: PromptContextLimits;
    loadAgentSessionStatus?: (
      agentSessionId: string,
    ) => AgentSessionContextStatus | null | Promise<AgentSessionContextStatus | null>;
  };

export type AgentContextSessionPreparedAgentTurn = PreparedAgentRunContext & {
  preparedPrompt: AgentContextSessionPromptResult;
  agentSessionStatus: AgentSessionContextStatus | null;
};

export type AgentContextSession = {
  set(input: AgentContextSessionSetInput): void;
  get(): ChatContextSummary | null;
  snapshot(): AgentContextSessionSnapshot;
  getConversation(): ConversationMessage[];
  setConversation(conversation: NormalizableConversationMessage[]): ConversationMessage[];
  getTrace(): AgentContextSessionTraceTurn[];
  getLastPrompt(): AgentContextSessionPromptResult | null;
  getSummary(): string;
  getActiveAgentRuntimeSessionId(agentId?: string | null): string | null;
  getContextLimits(input?: AgentContextRuntimeInput): PromptContextLimits;
  loadResources(
    input: AgentContextSessionLoadResourcesInput,
  ): Promise<AgentContextSessionLoadedResources>;
  prompt(input: AgentContextSessionPromptInput): Promise<AgentContextSessionPromptResult>;
  prepareAgentTurn(
    input: AgentContextSessionPrepareAgentTurnInput,
  ): Promise<AgentContextSessionPreparedAgentTurn>;
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

export type AgentContextSessionManager = AgentContextSession;

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
