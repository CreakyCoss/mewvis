import {
  formatConversationForSummary as formatConversationForSummaryInternal,
  normalizeChatContextSummary as normalizeChatContextSummaryInternal,
  normalizeConversationMessages as normalizeConversationMessagesInternal,
} from "./core/conversation";
import {
  countTextTokens as countTextTokensInternal,
  resolveAppContextWindow as resolveAppContextWindowInternal,
} from "./core/token-budget";
import {
  DEFAULT_CONTEXT_ENGINE_ID,
  getContextEngine as getContextEngineInternal,
  listContextEngines as listContextEnginesInternal,
} from "./engine/registry";
import {
  prepareMemoryBackedRuntimeContext as prepareMemoryBackedRuntimeContextInternal,
} from "./engine/domain-memory";
import {
  buildPromptContext as buildPromptContextInternal,
  buildSystemPrompt as buildSystemPromptInternal,
} from "./prompt/prompts";
import {
  appendReferencesToPrompt as appendReferencesToPromptInternal,
  formatReferencesForPrompt as formatReferencesForPromptInternal,
} from "./prompt/references";
import {
  createAgentContextSession,
} from "./session";
import type { AgentContextApi } from "./protocol/session";

const descriptorFor = (
  engine: ReturnType<typeof getContextEngineInternal>,
) => ({
  id: engine.id,
  version: engine.version,
  label: engine.label,
  description: engine.description,
  capabilities: [...engine.capabilities],
  experimental: engine.experimental,
});

const formatConversationForSummary:
  AgentContextApi["formatConversationForSummary"] =
    formatConversationForSummaryInternal;

const createSession:
  AgentContextApi["createSession"] =
    createAgentContextSession;

const createSessionManager:
  AgentContextApi["createSessionManager"] =
    createAgentContextSession;

const normalizeChatContextSummary:
  AgentContextApi["normalizeChatContextSummary"] =
    normalizeChatContextSummaryInternal;

const normalizeConversationMessages:
  AgentContextApi["normalizeConversationMessages"] =
    normalizeConversationMessagesInternal;

const countTextTokens:
  AgentContextApi["countTextTokens"] =
    countTextTokensInternal;

const resolveAppContextWindow:
  AgentContextApi["resolveAppContextWindow"] =
    resolveAppContextWindowInternal;

const getContextEngineDescriptor:
  AgentContextApi["getContextEngineDescriptor"] =
    (engineId) => descriptorFor(getContextEngineInternal(engineId));

const listContextEngineDescriptors:
  AgentContextApi["listContextEngineDescriptors"] =
    () => listContextEnginesInternal().map(descriptorFor);

const prepareMemoryBackedRuntimeContext:
  AgentContextApi["prepareMemoryBackedRuntimeContext"] =
    prepareMemoryBackedRuntimeContextInternal;

const buildPromptContext:
  AgentContextApi["buildPromptContext"] =
    buildPromptContextInternal;

const buildSystemPrompt:
  AgentContextApi["buildSystemPrompt"] =
    buildSystemPromptInternal;

const appendReferencesToPrompt:
  AgentContextApi["appendReferencesToPrompt"] =
    appendReferencesToPromptInternal;

const formatReferencesForPrompt:
  AgentContextApi["formatReferencesForPrompt"] =
    formatReferencesForPromptInternal;

export const agentContext: AgentContextApi = {
  DEFAULT_CONTEXT_ENGINE_ID,
  createSessionManager,
  createSession,
  formatConversationForSummary,
  normalizeChatContextSummary,
  normalizeConversationMessages,
  countTextTokens,
  resolveAppContextWindow,
  getContextEngineDescriptor,
  listContextEngineDescriptors,
  prepareMemoryBackedRuntimeContext,
  buildPromptContext,
  buildSystemPrompt,
  appendReferencesToPrompt,
  formatReferencesForPrompt,
};
