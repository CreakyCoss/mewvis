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
  type AgentRunSessionPlan,
} from "./engine/runtime-context";
import {
  prepareMemoryBackedRuntimeContext as prepareMemoryBackedRuntimeContextInternal,
} from "./engine/domain-memory";
import {
  buildPromptContext as buildPromptContextInternal,
} from "./prompt/prompts";
import {
  appendReferencesToPrompt as appendReferencesToPromptInternal,
  formatReferencesForPrompt as formatReferencesForPromptInternal,
} from "./prompt/references";
import type { AgentContextApi } from "./contracts";

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

const createContextPlan:
  AgentContextApi["createContextPlan"] =
    ({ engineId, ...selection }) => getContextEngineInternal(engineId).createPlan(selection);

const prepareConversationContext:
  AgentContextApi["prepareConversationContext"] =
    ({ engineId, ...input }) => getContextEngineInternal(engineId).prepareConversation(input);

const compressConversationContext:
  AgentContextApi["compressConversationContext"] =
    ({ engineId, ...input }) => getContextEngineInternal(engineId).compressConversation(input);

const rebuildConversationContextAfterHistoryChange:
  AgentContextApi["rebuildConversationContextAfterHistoryChange"] =
    ({ engineId, ...input }) => getContextEngineInternal(engineId).rebuildAfterHistoryChange(input);

const invalidateConversationContextAfterHistoryChange:
  AgentContextApi["invalidateConversationContextAfterHistoryChange"] =
    ({ engineId, context, conversation }) =>
      getContextEngineInternal(engineId).invalidateAfterHistoryChange(context, conversation);

const getActiveAgentRuntimeSessionId:
  AgentContextApi["getActiveAgentRuntimeSessionId"] =
    ({ engineId, context, agentId }) =>
      getContextEngineInternal(engineId).getActiveAgentRuntimeSessionId(context, agentId);

const selectConversationMessages:
  AgentContextApi["selectConversationMessages"] =
    ({ engineId, conversation, context, limits }) =>
      getContextEngineInternal(engineId).selectConversationMessages(conversation, context, limits);

const planAgentRunContext:
  AgentContextApi["planAgentRunContext"] =
    ({ engineId, ...input }) => getContextEngineInternal(engineId).planAgentRun(input);

const buildAgentRunContextPayload:
  AgentContextApi["buildAgentRunContextPayload"] =
    ({ engineId, ...input }) =>
      getContextEngineInternal(engineId).buildAgentPromptPayload({
        ...input,
        sessionPlan: input.sessionPlan as AgentRunSessionPlan,
      });

const finalizeChatTurnContext:
  AgentContextApi["finalizeChatTurnContext"] =
    ({ engineId, ...input }) => getContextEngineInternal(engineId).finalizeChatTurn(input);

const finalizeAgentRunContext:
  AgentContextApi["finalizeAgentRunContext"] =
    ({ engineId, ...input }) => getContextEngineInternal(engineId).finalizeAgentRun(input);

const prepareMemoryBackedRuntimeContext:
  AgentContextApi["prepareMemoryBackedRuntimeContext"] =
    prepareMemoryBackedRuntimeContextInternal;

const buildPromptContext:
  AgentContextApi["buildPromptContext"] =
    buildPromptContextInternal;

const appendReferencesToPrompt:
  AgentContextApi["appendReferencesToPrompt"] =
    appendReferencesToPromptInternal;

const formatReferencesForPrompt:
  AgentContextApi["formatReferencesForPrompt"] =
    formatReferencesForPromptInternal;

export const agentContext: AgentContextApi = {
  DEFAULT_CONTEXT_ENGINE_ID,
  formatConversationForSummary,
  normalizeChatContextSummary,
  normalizeConversationMessages,
  countTextTokens,
  resolveAppContextWindow,
  getContextEngineDescriptor,
  listContextEngineDescriptors,
  createContextPlan,
  prepareConversationContext,
  compressConversationContext,
  rebuildConversationContextAfterHistoryChange,
  invalidateConversationContextAfterHistoryChange,
  getActiveAgentRuntimeSessionId,
  selectConversationMessages,
  planAgentRunContext,
  buildAgentRunContextPayload,
  finalizeChatTurnContext,
  finalizeAgentRunContext,
  prepareMemoryBackedRuntimeContext,
  buildPromptContext,
  appendReferencesToPrompt,
  formatReferencesForPrompt,
};
