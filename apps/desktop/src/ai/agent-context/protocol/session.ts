import type {
  AgentSessionContextStatus,
  ChatContextSummary,
  ConversationMessage,
  ConversationRunStatus,
  ConversationSummarizer,
} from "./context";
import type { ContextEngineDescriptor } from "./descriptor";
import type {
  PreparedMemoryBackedRuntimeContext,
  PrepareMemoryBackedRuntimeContextInput,
} from "./memory";
import type {
  AgentRunContextPayload,
  AgentRunContextPlan,
  BuildPromptContextOptions,
  PreparedConversationContext,
  PromptAgentProfile,
  PromptContextFile,
  PromptContextLimits,
  PromptContextModel,
  PromptFileReference,
  PromptKnowledgeReference,
  PromptReference,
  ReferencePromptLimits,
  RuntimeContextPlan,
} from "./prompt";

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

export type AgentContextSessionSetInput = RuntimeContextSelectionInput & {
  context?: ChatContextSummary | null;
};

export type CreateAgentContextSessionInput = AgentContextSessionSetInput;

export type AgentContextSession = {
  set(input: AgentContextSessionSetInput): void;
  get(): ChatContextSummary | null;
  getSummary(): string;
  getActiveAgentRuntimeSessionId(agentId?: string | null): string | null;
  createPlan(input?: RuntimeContextSelectionInput): RuntimeContextPlan;
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
  selectConversationMessages(input: {
    conversation: ConversationMessage[];
    limits: PromptContextLimits;
  }): ConversationMessage[];
  planAgentRun(input: {
    chatSessionId: string;
    conversation: ConversationMessage[];
    agentId?: string | null;
    tokenBudget?: number;
    isHistoryInvalidated?: boolean;
  }): AgentRunContextPlan;
  buildAgentRunPayload(input: {
    conversation: ConversationMessage[];
    sessionPlan: AgentRunContextPlan;
    agentSessionStatus?: AgentSessionContextStatus | null;
    text: string;
    references: PromptFileReference[];
    knowledgeMatches?: PromptKnowledgeReference[];
    agentInstructions?: string | null;
    selectedAgent: PromptAgentProfile | null;
    limits: PromptContextLimits;
  }): AgentRunContextPayload;
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
