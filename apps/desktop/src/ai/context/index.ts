import { agentContext } from "./public-api";

export type {
  AgentSessionContextStatus,
  ChatContextSummary,
  ConversationMessage,
  ConversationRunStatus,
  ConversationSummarizer,
} from "./protocol/context";
export type {
  ContextEngineDescriptor,
} from "./protocol/descriptor";
export type {
  MemoryBackedRuntimeContextStats,
} from "./protocol/memory";
export type {
  BuildSystemPromptInput,
  PromptAgentProfile,
  PromptContextFile,
  PromptContextLimits,
  PromptContextModel,
  PromptFileReference,
  PromptKnowledgeReference,
  PromptSkillContext,
  PromptSystemPromptSection,
} from "./protocol/prompt";
export type {
  ContextRagIndex,
  ContextRagMatch,
  ContextRagQuery,
} from "./protocol/rag";
export type {
  AgentContextApi,
  NormalizableConversationMessage,
  TokenBudgetModel,
} from "./protocol/api";
export type {
  PreparedAgentConversationContext,
  PreparedAgentRunContext,
} from "./agent";
export type {
  ContextDebugPayload,
  ContextDebugSnapshot,
  ContextTraceStep,
  ContextTraceStepStatus,
  ContextTraceStepType,
  ContextTraceTurn,
} from "./debug";
export {
  loadContextResources,
  type ContextFileDescriptor,
  type ContextFileLoader,
  type LoadedContextResources,
  type LoadContextResourcesInput,
} from "./resources";

export const {
  DEFAULT_CONTEXT_ENGINE_ID,
  appendReferencesToPrompt,
  buildPromptContext,
  buildSystemPrompt,
  countTextTokens,
  formatConversationForSummary,
  formatReferencesForPrompt,
  getContextEngineDescriptor,
  listContextEngineDescriptors,
  normalizeChatContextSummary,
  normalizeConversationMessages,
  prepareMemoryBackedRuntimeContext,
  resolveAppContextWindow,
} = agentContext;
