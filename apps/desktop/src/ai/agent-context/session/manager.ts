import type {
  ChatContextSummary,
  ConversationSummarizer,
} from "../protocol/context";
import type {
  PromptContextModel,
} from "../protocol/prompt";
import type {
  AgentContextSessionStateManager,
  AgentContextSessionStateSnapshot,
  AgentContextSessionSetInput,
  CreateAgentContextSessionStateManagerInput,
} from "../protocol/session";

export const createAgentContextSessionStateManager = (
  initialInput: CreateAgentContextSessionStateManagerInput = {},
): AgentContextSessionStateManager => {
  let engineId = initialInput.engineId ?? null;
  let context = initialInput.context ?? null;
  let modelContext: PromptContextModel | null = initialInput.modelContext ?? null;
  let summarizer: ConversationSummarizer | null = initialInput.summarizer ?? null;
  let canUseModel = initialInput.canUseModel ?? false;

  const snapshot = (): AgentContextSessionStateSnapshot => ({
    engineId,
    context,
    modelContext,
    summarizer,
    canUseModel,
  });

  const manager: AgentContextSessionStateManager = {
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

export const createAgentContextSessionManager =
  createAgentContextSessionStateManager;
