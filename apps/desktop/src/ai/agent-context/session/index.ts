import {
  getContextEngine,
} from "../engine/registry";
import type {
  AgentRunSessionPlan,
} from "../engine/types";
import type {
  AgentContextSession,
  AgentContextSessionSetInput,
  CreateAgentContextSessionInput,
} from "../protocol/session";
import type {
  ChatContextSummary,
  ConversationSummarizer,
} from "../protocol/context";
import type {
  PromptContextModel,
} from "../protocol/prompt";

export const createAgentContextSession = (
  initialInput: CreateAgentContextSessionInput = {},
): AgentContextSession => {
  let engineId = initialInput.engineId ?? null;
  let context = initialInput.context ?? null;
  let modelContext: PromptContextModel | null = initialInput.modelContext ?? null;
  let summarizer: ConversationSummarizer | null = initialInput.summarizer ?? null;
  let canUseModel = initialInput.canUseModel ?? false;

  const engine = () => getContextEngine(engineId);
  const engineFor = (nextEngineId?: string | null) =>
    getContextEngine(nextEngineId === undefined ? engineId : nextEngineId);
  const selection = (input: AgentContextSessionSetInput = {}) => ({
    modelContext: input.modelContext ?? modelContext,
    summarizer: input.summarizer ?? summarizer,
    canUseModel: input.canUseModel ?? canUseModel,
  });
  const applyContext = (nextContext: ChatContextSummary | null) => {
    context = nextContext;
    return nextContext;
  };

  const session: AgentContextSession = {
    set(input) {
      if ("engineId" in input) {
        engineId = input.engineId ?? null;
      }
      if ("context" in input) {
        context = input.context ?? null;
      }
      if ("modelContext" in input) {
        modelContext = input.modelContext ?? null;
      }
      if ("summarizer" in input) {
        summarizer = input.summarizer ?? null;
      }
      if ("canUseModel" in input) {
        canUseModel = input.canUseModel ?? false;
      }
    },
    get() {
      return context;
    },
    getSummary() {
      return context?.summary ?? "";
    },
    getActiveAgentRuntimeSessionId(agentId) {
      return engine().getActiveAgentRuntimeSessionId(context, agentId);
    },
    createPlan(input = {}) {
      return engineFor(input.engineId).createPlan(selection(input));
    },
    async prepareConversation(input) {
      const prepared = await engine().prepareConversation({
        ...selection(),
        conversation: input.conversation,
        currentContext: context,
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      });
      summarizer = prepared.summarizer ?? null;
      applyContext(prepared.context);
      return prepared;
    },
    async compressConversation(input) {
      return applyContext(await engine().compressConversation({
        ...selection(),
        conversation: input.conversation,
        currentContext: context,
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      }));
    },
    async rebuildAfterHistoryChange(input) {
      return applyContext(await engine().rebuildAfterHistoryChange({
        ...selection(),
        conversation: input.conversation,
        currentContext: context,
      }));
    },
    invalidateAfterHistoryChange(input) {
      const nextContext = engine().invalidateAfterHistoryChange(context, input.conversation);
      applyContext(nextContext);
      return nextContext;
    },
    selectConversationMessages(input) {
      return engine().selectConversationMessages(
        input.conversation,
        context,
        input.limits,
      );
    },
    planAgentRun(input) {
      return engine().planAgentRun({
        chatSessionId: input.chatSessionId,
        conversation: input.conversation,
        currentContext: context,
        agentId: input.agentId,
        tokenBudget: input.tokenBudget,
        isHistoryInvalidated: input.isHistoryInvalidated,
      });
    },
    buildAgentRunPayload(input) {
      return engine().buildAgentPromptPayload({
        ...input,
        currentContext: context,
        sessionPlan: input.sessionPlan as AgentRunSessionPlan,
      });
    },
    async finalizeChatTurn(input) {
      return applyContext(await engine().finalizeChatTurn({
        ...selection(),
        conversation: input.conversation,
        currentContext: context,
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      }));
    },
    async finalizeAgentRun(input) {
      return applyContext(await engine().finalizeAgentRun({
        ...input,
        conversation: input.conversation,
        currentContext: context,
        summarizer,
      }));
    },
  };

  return session;
};
