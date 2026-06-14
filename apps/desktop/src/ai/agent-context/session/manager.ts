import type {
  ChatContextSummary,
  ConversationSummarizer,
} from "../protocol/context";
import type {
  PromptContextModel,
} from "../protocol/prompt";
import type {
  AgentContextSessionManager,
  AgentContextSessionManagerSnapshot,
  AgentContextSessionSetInput,
  CreateAgentContextSessionManagerInput,
} from "../protocol/session";

export const createAgentContextSessionManager = (
  initialInput: CreateAgentContextSessionManagerInput = {},
): AgentContextSessionManager => {
  let engineId = initialInput.engineId ?? null;
  let context = initialInput.context ?? null;
  let modelContext: PromptContextModel | null = initialInput.modelContext ?? null;
  let summarizer: ConversationSummarizer | null = initialInput.summarizer ?? null;
  let canUseModel = initialInput.canUseModel ?? false;

  const snapshot = (): AgentContextSessionManagerSnapshot => ({
    engineId,
    context,
    modelContext,
    summarizer,
    canUseModel,
  });

  const manager: AgentContextSessionManager = {
    get() {
      return snapshot();
    },
    set(input: AgentContextSessionSetInput) {
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
    getContext() {
      return context;
    },
    setContext(nextContext: ChatContextSummary | null) {
      context = nextContext;
      return context;
    },
    getSummary() {
      return context?.summary ?? "";
    },
  };

  return manager;
};
