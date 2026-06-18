import type {
  ChatContextSummary,
  ConversationMessage,
} from "./context";
import type { ContextEngineDescriptor } from "./descriptor";
import type {
  PreparedMemoryBackedRuntimeContext,
  PrepareMemoryBackedRuntimeContextInput,
} from "./memory";
import type {
  BuildPromptContextOptions,
  BuildSystemPromptInput,
  PromptAgentProfile,
  PromptContextFile,
  PromptFileReference,
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
  buildSystemPrompt(input: BuildSystemPromptInput): string;
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
