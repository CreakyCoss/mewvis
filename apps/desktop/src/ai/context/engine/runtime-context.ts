import {
  buildRuntimeConversationContext,
  buildRuntimeConversationMessages,
  buildUnsyncedAgentConversationContext,
  createAgentRuntimeSessionId,
  createAgentSessionFingerprint,
  createAgentSessionGenerationId,
  EMPTY_RUNTIME_CONVERSATION_CONTEXT,
  getAgentConversationSync,
  invalidateConversationContextForHistoryChange,
  markAgentConversationSynced,
  updateConversationContext,
} from "../core/conversation";
import {
  buildAgentBootstrapPrompt,
  buildAgentPrompt,
  createPromptContextLimits,
  type PromptContextLimits,
} from "../prompt/prompts";
import type {
  ChatContextSummary,
  ContextEngineState,
  ContextMemoryLayerSnapshot,
  ConversationMessage,
} from "../core/types";
import type {
  AgentRunPromptPayload,
  AgentRunSessionPlan,
  BuildAgentRunPromptPayloadInput,
  ContextEngine,
  ContextEngineFactoryOptions,
  FinalizeAgentRunContextInput,
  PlanAgentRunSessionInput,
  PreparedRuntimeConversationContext,
  PrepareRuntimeConversationContextInput,
  RuntimeContextModelSelection,
  RuntimeContextPlan,
} from "./types";

export const DEFAULT_CONTEXT_ENGINE_ID = "rolling-summary";
export const DEFAULT_CONTEXT_ENGINE_VERSION = 1;
export const RAG_CONTEXT_ENGINE_ID = "rag-index";
export const HYBRID_MEMORY_CONTEXT_ENGINE_ID = "hybrid-memory";

export const createRuntimeContextPlan = ({
  modelContext,
  summarizer,
  canUseModel = true,
}: RuntimeContextModelSelection): RuntimeContextPlan => ({
  limits: createPromptContextLimits(modelContext),
  summarizer: canUseModel ? summarizer ?? undefined : undefined,
});

export const prepareRuntimeConversationContext = async ({
  conversation,
  currentContext,
  forceSummarize,
  rebuildSummary,
  ...selection
}: PrepareRuntimeConversationContextInput): Promise<PreparedRuntimeConversationContext> => {
  const plan = createRuntimeContextPlan(selection);
  const context = await updateConversationContext(
    conversation,
    currentContext,
    {
      summarizer: plan.summarizer,
      tokenBudget: plan.limits.recentHistoryTokens,
      forceSummarize,
      rebuildSummary,
    },
  );

  return {
    ...plan,
    context,
    runtimeMessages: buildRuntimeConversationMessages(
      conversation,
      context,
      plan.limits.recentHistoryTokens,
    ),
    conversationSummary: context?.summary ?? "",
  };
};

export const selectRuntimeConversationMessages = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
  limits: PromptContextLimits,
) => buildRuntimeConversationMessages(
  conversation,
  context,
  limits.recentHistoryTokens,
);

export const compressRuntimeConversationContext = async (
  input: PrepareRuntimeConversationContextInput,
) => input.conversation.length === 0
  ? input.currentContext
  : (await prepareRuntimeConversationContext({
    ...input,
    forceSummarize: true,
    rebuildSummary: true,
  })).context;

export const rebuildRuntimeConversationContextAfterHistoryChange = async (
  input: PrepareRuntimeConversationContextInput,
) => input.conversation.length === 0
  ? invalidateConversationContextForHistoryChange(
    input.currentContext,
    input.conversation,
  )
  : (await prepareRuntimeConversationContext({
    ...input,
    forceSummarize: true,
    rebuildSummary: true,
  })).context;

export const invalidateRuntimeConversationContext =
  invalidateConversationContextForHistoryChange;

export const getActiveAgentRuntimeSessionId = (
  context: ChatContextSummary | null | undefined,
  agentId?: string | null,
) => {
  if (context?.historyInvalidatedAt) {
    return null;
  }

  const sync = getAgentConversationSync(context, agentId);
  return sync && !sync.invalidatedAt ? sync.sessionId : null;
};

export const planAgentRunSession = ({
  chatSessionId,
  sessionRoot,
  conversation,
  currentContext,
  agentId,
  tokenBudget,
  isHistoryInvalidated,
}: PlanAgentRunSessionInput): AgentRunSessionPlan => {
  const promptHistory = buildUnsyncedAgentConversationContext(
    conversation,
    currentContext,
    agentId,
    tokenBudget,
  );
  const existingAgentSessionId = promptHistory.agentSessionId ||
    getAgentConversationSync(currentContext, agentId)?.sessionId ||
    null;
  const shouldStartFreshSession = Boolean(
    isHistoryInvalidated ||
      currentContext?.historyInvalidatedAt ||
      promptHistory.syncStatus === "stale",
  );
  const agentSessionId = shouldStartFreshSession || !existingAgentSessionId
    ? createAgentRuntimeSessionId(
      chatSessionId,
      agentId,
      createAgentSessionGenerationId(),
      sessionRoot,
    )
    : existingAgentSessionId;

  return {
    agentSessionId,
    promptHistory,
    shouldStartFreshSession,
  };
};

export const buildAgentRunPromptPayload = ({
  conversation,
  currentContext,
  sessionPlan,
  agentSessionStatus,
  text,
  references,
  knowledgeMatches,
  agentInstructions,
  selectedAgent,
  limits,
}: BuildAgentRunPromptPayloadInput): AgentRunPromptPayload => {
  const shouldBootstrapAgentContext = Boolean(
    sessionPlan.shouldStartFreshSession ||
      agentSessionStatus?.exists === false ||
      agentSessionStatus?.sessionFileCount === 0,
  );
  const bootstrapHistory = buildRuntimeConversationContext(
    conversation,
    currentContext,
    limits.recentHistoryTokens,
  );
  const promptHistory = shouldBootstrapAgentContext
    ? EMPTY_RUNTIME_CONVERSATION_CONTEXT
    : sessionPlan.promptHistory;

  return {
    bootstrapContext: buildAgentBootstrapPrompt(
      bootstrapHistory,
      selectedAgent,
      limits,
    ),
    prompt: buildAgentPrompt(
      text,
      references,
      promptHistory,
      selectedAgent,
      limits,
      {
        includeConversationSummary: promptHistory.syncStatus === "stale",
        includeRecentConversation: true,
        contextQuery: text,
        knowledgeMatches,
        interactionInstructions: agentInstructions,
      },
    ),
    shouldBootstrapAgentContext,
    bootstrapHistory,
    promptHistory,
  };
};

export const finalizeAgentRunContext = async ({
  conversation,
  currentContext,
  summarizer,
  tokenBudget,
  agentSessionId,
  agentId,
  runStatus,
  agentSessionStatus,
}: FinalizeAgentRunContextInput) => {
  const nextContext = await updateConversationContext(
    conversation,
    currentContext,
    {
      summarizer: summarizer ?? undefined,
      tokenBudget,
    },
  );

  return agentSessionId
    ? markAgentConversationSynced(nextContext, conversation, agentId, {
      sessionId: agentSessionId,
      updatedAt: Date.now(),
      lastRunStatus: runStatus,
      sessionFingerprint: createAgentSessionFingerprint(agentSessionStatus),
    })
    : nextContext;
};

const resolveContextEngineState = async (
  engine: Pick<ContextEngine, "id" | "version" | "services">,
  previousContext?: ChatContextSummary | null,
  metadata?: Record<string, unknown>,
): Promise<ContextEngineState> => {
  const ragIndex = engine.services?.ragIndex
    ? await Promise.resolve(engine.services.ragIndex.getSnapshot())
    : previousContext?.engine?.ragIndex ?? null;
  const memoryLayers = engine.services?.memoryLayers
    ? (await Promise.all(
      engine.services.memoryLayers.map((layer) => Promise.resolve(layer.getSnapshot())),
    )).filter((snapshot): snapshot is ContextMemoryLayerSnapshot => Boolean(snapshot))
    : previousContext?.engine?.memoryLayers ?? [];

  return {
    id: engine.id,
    version: engine.version,
    updatedAt: Date.now(),
    ragIndex,
    memoryLayers,
    metadata: {
      ...(previousContext?.engine?.metadata ?? {}),
      ...(metadata ?? {}),
    },
  };
};

const attachContextEngineState = async (
  context: ChatContextSummary | null,
  engine: Pick<ContextEngine, "id" | "version" | "services">,
  previousContext?: ChatContextSummary | null,
  metadata?: Record<string, unknown>,
) => context
  ? {
    ...context,
    engine: await resolveContextEngineState(engine, previousContext, metadata),
  }
  : context;

export const createDefaultContextEngine = (
  options: ContextEngineFactoryOptions = {},
): ContextEngine => {
  const engineShell = {
    id: options.id ?? DEFAULT_CONTEXT_ENGINE_ID,
    version: options.version ?? DEFAULT_CONTEXT_ENGINE_VERSION,
    label: options.label ?? "滚动摘要",
    description: options.description ?? "使用摘要和最近历史管理上下文，是当前稳定实现。",
    capabilities: options.capabilities ?? ["rolling_summary", "agent_session_sync"],
    experimental: options.experimental,
    services: options.services,
  };

  const engine: ContextEngine = {
    ...engineShell,
    createPlan: createRuntimeContextPlan,
    async prepareConversation(input) {
      const prepared = await prepareRuntimeConversationContext(input);
      return {
        ...prepared,
        context: await attachContextEngineState(
          prepared.context,
          engineShell,
          input.currentContext,
          options.metadata,
        ),
      };
    },
    selectConversationMessages: selectRuntimeConversationMessages,
    async compressConversation(input) {
      const context = await compressRuntimeConversationContext(input);
      return attachContextEngineState(
        context,
        engineShell,
        input.currentContext,
        options.metadata,
      );
    },
    async rebuildAfterHistoryChange(input) {
      const context = await rebuildRuntimeConversationContextAfterHistoryChange(input);
      return attachContextEngineState(
        context,
        engineShell,
        input.currentContext,
        options.metadata,
      );
    },
    invalidateAfterHistoryChange(context, conversation) {
      const invalidated = invalidateConversationContextForHistoryChange(context, conversation);
      return {
        ...invalidated,
        engine: {
          id: engineShell.id,
          version: engineShell.version,
          updatedAt: Date.now(),
          ragIndex: context?.engine?.ragIndex ?? null,
          memoryLayers: context?.engine?.memoryLayers ?? [],
          metadata: {
            ...(context?.engine?.metadata ?? {}),
            ...(options.metadata ?? {}),
          },
        },
      };
    },
    getActiveAgentRuntimeSessionId,
    planAgentRun: planAgentRunSession,
    buildAgentPromptPayload: buildAgentRunPromptPayload,
    async finalizeChatTurn(input) {
      const prepared = await engine.prepareConversation(input);
      return prepared.context;
    },
    async finalizeAgentRun(input) {
      const context = await finalizeAgentRunContext(input);
      return attachContextEngineState(
        context,
        engineShell,
        input.currentContext,
        options.metadata,
      );
    },
  };

  return engine;
};
