import {
  getContextEngine,
} from "../engine/registry";
import type {
  AgentContextSession,
  AgentContextRuntimeInput,
  CreateAgentContextSessionInput,
} from "../protocol/session";
import type {
  ChatContextSummary,
  ConversationSummarizer,
} from "../protocol/context";
import {
  createAgentContextSessionManager,
} from "./manager";

export const createAgentContextSession = (
  initialInput: CreateAgentContextSessionInput = {},
): AgentContextSession => {
  const {
    manager: initialManager,
    ...managerInput
  } = initialInput;
  const manager = initialManager ?? createAgentContextSessionManager(managerInput);

  const engine = () => getContextEngine(manager.get().engineId);
  const engineFor = (nextEngineId?: string | null) =>
    getContextEngine(nextEngineId === undefined ? manager.get().engineId : nextEngineId);
  const selection = (input: AgentContextRuntimeInput = {}) => {
    const current = manager.get();
    return {
      modelContext: input.modelContext ?? current.modelContext,
      summarizer: input.summarizer ?? current.summarizer,
      canUseModel: input.canUseModel ?? current.canUseModel,
    };
  };
  const currentContext = () => manager.getContext();
  const applyContext = (nextContext: ChatContextSummary | null) =>
    manager.setContext(nextContext);
  const setSummarizer = (
    summarizer: ConversationSummarizer | null | undefined,
  ) => manager.set({
    summarizer: summarizer ?? null,
  });

  const session: AgentContextSession = {
    set(input) {
      manager.set(input);
    },
    get() {
      return manager.getContext();
    },
    getSummary() {
      return manager.getSummary();
    },
    getActiveAgentRuntimeSessionId(agentId) {
      return engine().getActiveAgentRuntimeSessionId(currentContext(), agentId);
    },
    getContextLimits(input = {}) {
      return engineFor(input.engineId).createPlan(selection(input)).limits;
    },
    async prepareConversation(input) {
      const prepared = await engine().prepareConversation({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      });
      setSummarizer(prepared.summarizer);
      applyContext(prepared.context);
      return {
        limits: prepared.limits,
        context: prepared.context,
        runtimeMessages: prepared.runtimeMessages,
        conversationSummary: prepared.conversationSummary,
      };
    },
    async compressConversation(input) {
      return applyContext(await engine().compressConversation({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      }));
    },
    async rebuildAfterHistoryChange(input) {
      return applyContext(await engine().rebuildAfterHistoryChange({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
      }));
    },
    invalidateAfterHistoryChange(input) {
      const nextContext = engine().invalidateAfterHistoryChange(currentContext(), input.conversation);
      applyContext(nextContext);
      return nextContext;
    },
    selectRecentConversation(input) {
      return engine().selectConversationMessages(
        input.conversation,
        currentContext(),
        input.limits,
      );
    },
    async prepareAgentRun(input) {
      const sessionPlan = engine().planAgentRun({
        chatSessionId: input.chatSessionId,
        conversation: input.conversation,
        currentContext: currentContext(),
        agentId: input.agentId,
        tokenBudget: input.tokenBudget,
        isHistoryInvalidated: input.isHistoryInvalidated,
      });
      const agentSessionStatus = input.loadAgentSessionStatus
        ? await input.loadAgentSessionStatus(sessionPlan.agentSessionId)
        : null;
      const payload = engine().buildAgentPromptPayload({
        ...input,
        currentContext: currentContext(),
        sessionPlan,
        agentSessionStatus,
      });
      return {
        agentSessionId: sessionPlan.agentSessionId,
        ...payload,
      };
    },
    async finalizeChatTurn(input) {
      return applyContext(await engine().finalizeChatTurn({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      }));
    },
    async finalizeAgentRun(input) {
      return applyContext(await engine().finalizeAgentRun({
        ...input,
        conversation: input.conversation,
        currentContext: currentContext(),
        summarizer: manager.get().summarizer,
      }));
    },
  };

  return session;
};
