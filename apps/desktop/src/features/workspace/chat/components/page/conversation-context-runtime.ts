import type {
  AgentContextConversationContextController,
  AgentContextSessionStateReader,
  AgentContextSessionStateWriter,
  AgentSessionContextStatus,
  ChatContextSummary,
  ConversationMessage,
  ConversationRunStatus,
  ConversationSummarizer,
  PromptContextModel,
} from "@/ai/agent-context";
import type { RuntimeModelOption } from "@/features/ai/llm/store";
import type { ChatTraceTurn } from "../../types";
import {
  contextCompressionTraceStep,
  didConversationContextCompress,
  type ChatTraceStepInput,
} from "./trace";

type RuntimeContextModelInput = {
  runtimeModel: RuntimeModelOption | null;
  contextModelFor: (runtimeModel?: RuntimeModelOption | null) => PromptContextModel;
  summarizerFor: (runtimeModel?: RuntimeModelOption | null) => ConversationSummarizer | null;
};

export type ConversationContextCompressorSession =
  AgentContextSessionStateReader &
  AgentContextSessionStateWriter &
  Pick<AgentContextConversationContextController, "compressConversation">;

export type ConversationContextHistorySession =
  AgentContextSessionStateWriter &
  Pick<
    AgentContextConversationContextController,
    "invalidateAfterHistoryChange" | "rebuildAfterHistoryChange"
  >;

export type AgentRunContextFinalizerSession =
  AgentContextSessionStateReader &
  AgentContextSessionStateWriter &
  Pick<AgentContextConversationContextController, "finalizeAgentRun">;

export type CompressedConversationContextRuntime = {
  previousContext: ChatContextSummary | null;
  nextContext: ChatContextSummary | null;
  traceSteps: ChatTraceStepInput[];
};

export const compressConversationContextRuntime = async ({
  contextSession,
  chatId,
  contextEngineId,
  fallbackContext,
  conversation,
  runtimeModel,
  contextModelFor,
  summarizerFor,
  runtimeAgentRequiresModel,
  startedAt,
  mode,
  phase,
  providerName,
  modelName,
}: {
  contextSession: ConversationContextCompressorSession;
  chatId: string | null;
  contextEngineId: string;
  fallbackContext: ChatContextSummary | null;
  conversation: ConversationMessage[];
  runtimeAgentRequiresModel: boolean;
  startedAt: number;
  mode: ChatTraceTurn["mode"] | "manual";
  phase: "manual" | "prepare" | "finalize" | "agent_finalize";
  providerName?: string | null;
  modelName?: string | null;
} & RuntimeContextModelInput): Promise<CompressedConversationContextRuntime> => {
  const previousContext = contextSession.get() ?? fallbackContext;

  contextSession.set({
    chatId,
    engineId: contextEngineId,
    context: previousContext,
    modelContext: contextModelFor(runtimeModel),
    summarizer: summarizerFor(runtimeModel),
    canUseModel: runtimeAgentRequiresModel,
  });
  const nextContext = await contextSession.compressConversation({
    conversation,
  });
  const traceSteps = didConversationContextCompress(previousContext, nextContext)
    ? [contextCompressionTraceStep({
      startedAt,
      previousContext,
      nextContext,
      conversationLength: conversation.length,
      mode,
      phase,
      engineId: contextEngineId,
      providerName,
      modelName,
      canUseModel: runtimeAgentRequiresModel,
    })]
    : [];

  return {
    previousContext,
    nextContext,
    traceSteps,
  };
};

export const rebuildContextAfterHistoryChangeRuntime = async ({
  contextSession,
  chatId,
  contextEngineId,
  currentContext,
  nextConversation,
  runtimeModel,
  contextModelFor,
  summarizerFor,
  runtimeAgentRequiresModel,
}: {
  contextSession: ConversationContextHistorySession;
  chatId: string | null;
  contextEngineId: string;
  currentContext: ChatContextSummary | null;
  nextConversation: ConversationMessage[];
  runtimeAgentRequiresModel: boolean;
} & RuntimeContextModelInput): Promise<ChatContextSummary | null> => {
  contextSession.set({
    chatId,
    engineId: contextEngineId,
    context: currentContext,
    modelContext: contextModelFor(runtimeModel),
    summarizer: summarizerFor(runtimeModel),
    canUseModel: runtimeAgentRequiresModel,
  });

  return contextSession.rebuildAfterHistoryChange({
    conversation: nextConversation,
  });
};

export const invalidateContextAfterHistoryChangeRuntime = ({
  contextSession,
  chatId,
  contextEngineId,
  currentContext,
  conversation,
}: {
  contextSession: ConversationContextHistorySession;
  chatId: string | null;
  contextEngineId: string;
  currentContext: ChatContextSummary | null;
  conversation: ConversationMessage[];
}): ChatContextSummary => {
  contextSession.set({
    chatId,
    engineId: contextEngineId,
    context: currentContext,
  });

  return contextSession.invalidateAfterHistoryChange({
    conversation,
  });
};

export const finalizeAgentRunContextRuntime = async ({
  contextSession,
  chatId,
  contextEngineId,
  conversation,
  agentSessionId,
  agentId,
  runStatus,
  agentSessionStatus,
  runtimeAgentRequiresModel,
  startedAt,
}: {
  contextSession: AgentRunContextFinalizerSession;
  chatId: string | null;
  contextEngineId: string;
  conversation: ConversationMessage[];
  agentSessionId?: string | null;
  agentId?: string | null;
  runStatus: ConversationRunStatus;
  agentSessionStatus?: AgentSessionContextStatus | null;
  runtimeAgentRequiresModel: boolean;
  startedAt: number;
}): Promise<CompressedConversationContextRuntime> => {
  const previousContext = contextSession.get();

  contextSession.set({
    chatId,
    engineId: contextEngineId,
    context: previousContext,
  });
  const nextContext = await contextSession.finalizeAgentRun({
    conversation,
    agentSessionId,
    agentId,
    runStatus,
    agentSessionStatus,
  });
  const traceSteps = didConversationContextCompress(previousContext, nextContext)
    ? [contextCompressionTraceStep({
      startedAt,
      previousContext,
      nextContext,
      conversationLength: conversation.length,
      mode: "agent",
      phase: "agent_finalize",
      engineId: contextEngineId,
      providerName: null,
      modelName: null,
      canUseModel: runtimeAgentRequiresModel,
    })]
    : [];

  return {
    previousContext,
    nextContext,
    traceSteps,
  };
};
