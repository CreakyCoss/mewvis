import type {
  AgentContextConversationContextController,
  AgentContextSessionPromptInput,
  AgentContextSessionPromptResult,
  AgentContextSessionStateWriter,
  AgentContextSessionTurnRunner,
  ChatContextSummary,
  ConversationMessage,
  ConversationSummarizer,
  PreparedAgentRunContext,
  PromptAgentProfile,
  PromptContextModel,
} from "@/ai/agent-context";
import type { RuntimeModelOption } from "@/features/ai/llm/store";
import type { ChatMode, ContextDebugSnapshot } from "../../page-types";
import type { AgentSessionStatus } from "../../types";
import { buildContextDebugSnapshot } from "./context-debug";
import {
  contextCompressionTraceStep,
  didConversationContextCompress,
  mapSessionPromptTraceSteps,
  type ChatTraceStepInput,
} from "./trace";
import type {
  LimitsForProvider,
  ReportContextDebugUpdate,
} from "./modes/types";

export type ManagedTurnContextSession =
  AgentContextSessionStateWriter &
  AgentContextSessionTurnRunner;

export type ManagedTurnFinalizerSession =
  AgentContextSessionStateWriter &
  Pick<AgentContextConversationContextController, "finalizeChatTurn">;

export type PrepareManagedTurnRuntimeInput = {
  contextSession: ManagedTurnContextSession;
  contextEngineId: string;
  effectiveAppContextWindow: number;
  runtimeAgentRequiresModel: boolean;
  contextModelFor: (runtimeModel?: RuntimeModelOption | null) => PromptContextModel;
  summarizerFor: (runtimeModel?: RuntimeModelOption | null) => ConversationSummarizer | null;
  searchKnowledge?: AgentContextSessionPromptInput["searchKnowledge"];
  nextSessionId: string | null;
  userMessageId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: Array<{ path: string }>;
  activeFile: AgentContextSessionPromptInput["activeFile"];
  nextConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  summaryRuntimeModel: RuntimeModelOption | null;
  prepareAgentPayload?: boolean;
  runtimeAgentId: string;
  agentContextInvalidated: boolean;
  selectedAgent: PromptAgentProfile | null;
  agentInstructions: string;
  loadAgentSessionStatus?: (
    agentSessionId: string,
  ) => AgentSessionStatus | null | Promise<AgentSessionStatus | null>;
};

export type PreparedManagedTurnRuntime = {
  result: AgentContextSessionPromptResult;
  agentPromptPayload: PreparedAgentRunContext | null;
  limitsFor: LimitsForProvider;
  contextWindow: number;
};

export type ManagedPreparationTraceInput = {
  result: AgentContextSessionPromptResult;
  mode: ChatMode;
  contextEngineId: string;
  runtimeModel: RuntimeModelOption | null;
  runtimeAgentRequiresModel: boolean;
};

export type ManagedContextDebugReporterInput = {
  result: AgentContextSessionPromptResult;
  mode: ChatMode;
  contextEngineId: string;
  contextWindow: number;
  runtimeAgentId: string;
  providerName: string | null;
  modelName: string | null;
  onDebugSnapshot(snapshot: ContextDebugSnapshot): void;
};

export type FinalizeManagedAssistantTurnInput = {
  contextSession: ManagedTurnFinalizerSession;
  nextSessionId: string | null;
  contextEngineId: string;
  contextBeforeFinalize: ChatContextSummary | null;
  modelContext: PromptContextModel;
  runtimeAgentRequiresModel: boolean;
  nextConversation: ConversationMessage[];
  assistantMessageId: string;
  mode: "chat" | "collab";
  assistantText: string;
  assistantMessages?: ConversationMessage[];
  resultConversationSummary: string;
  startedAt: number;
  providerName?: string | null;
  modelName?: string | null;
};

export type FinalizedManagedAssistantTurn = {
  finalConversation: ConversationMessage[];
  finalContext: ChatContextSummary | null;
  conversationSummary: string;
  traceSteps: ChatTraceStepInput[];
};

export const prepareManagedTurnRuntime = async ({
  contextSession,
  contextEngineId,
  effectiveAppContextWindow,
  runtimeAgentRequiresModel,
  contextModelFor,
  summarizerFor,
  searchKnowledge,
  nextSessionId,
  userMessageId,
  assistantMessageId,
  text,
  referencedFiles,
  activeFile,
  nextConversation,
  baseConversationContext,
  summaryRuntimeModel,
  prepareAgentPayload = false,
  runtimeAgentId,
  agentContextInvalidated,
  selectedAgent,
  agentInstructions,
  loadAgentSessionStatus,
}: PrepareManagedTurnRuntimeInput): Promise<PreparedManagedTurnRuntime> => {
  const limitsFor: LimitsForProvider = (
    runtimeModel,
  ) => contextSession.getContextLimits({
    engineId: contextEngineId,
    modelContext: contextModelFor(runtimeModel),
    canUseModel: false,
  });
  const summaryModelContext = contextModelFor(summaryRuntimeModel);
  const summarySummarizer = summarizerFor(summaryRuntimeModel);
  const contextWindow = summaryModelContext.contextWindow ?? effectiveAppContextWindow;

  contextSession.set({
    chatId: nextSessionId,
    engineId: contextEngineId,
    context: baseConversationContext,
    modelContext: summaryModelContext,
    summarizer: summarySummarizer,
    canUseModel: runtimeAgentRequiresModel,
    searchKnowledge,
  });

  const promptConversation = nextConversation.slice(0, -1);
  const promptInput = {
    chatId: nextSessionId,
    id: userMessageId,
    assistantMessageId,
    text,
    conversation: promptConversation,
    references: referencedFiles,
    activeFile,
    systemPrompt: "",
    execute: false,
    appendAssistantMessage: false,
  } satisfies AgentContextSessionPromptInput;

  if (!prepareAgentPayload) {
    return {
      result: await contextSession.prompt(promptInput),
      agentPromptPayload: null,
      limitsFor,
      contextWindow,
    };
  }

  if (!nextSessionId) {
    throw new Error("无法创建 Agent 长期上下文，请重试");
  }

  const agentLimits = limitsFor(summaryRuntimeModel);
  const agentTurn = await contextSession.prepareAgentTurn({
    ...promptInput,
    chatSessionId: nextSessionId,
    agentConversation: promptConversation,
    agentContext: baseConversationContext,
    agentId: runtimeAgentId,
    tokenBudget: agentLimits.recentHistoryTokens,
    isHistoryInvalidated: agentContextInvalidated,
    agentInstructions,
    selectedAgent,
    limits: agentLimits,
    loadAgentSessionStatus,
  });

  return {
    result: agentTurn.preparedPrompt,
    agentPromptPayload: {
      agentSessionId: agentTurn.agentSessionId,
      bootstrapContext: agentTurn.bootstrapContext,
      prompt: agentTurn.prompt,
      shouldBootstrapAgentContext: agentTurn.shouldBootstrapAgentContext,
      bootstrapHistory: agentTurn.bootstrapHistory,
      promptHistory: agentTurn.promptHistory,
    },
    limitsFor,
    contextWindow,
  };
};

export const managedPreparationTraceSteps = ({
  result,
  mode,
  contextEngineId,
  runtimeModel,
  runtimeAgentRequiresModel,
}: ManagedPreparationTraceInput): ChatTraceStepInput[] => {
  const traceSteps = mapSessionPromptTraceSteps(
    result.traceTurn.steps,
    new Set(["上下文文件", "上下文准备", "知识检索"]),
  );

  if (didConversationContextCompress(result.previousContext, result.context)) {
    traceSteps.push(contextCompressionTraceStep({
      startedAt: result.traceTurn.createdAt,
      previousContext: result.previousContext,
      nextContext: result.context,
      conversationLength: result.conversation.length,
      mode,
      phase: "prepare",
      engineId: contextEngineId,
      providerName: runtimeModel?.provider.name ?? null,
      modelName: runtimeModel?.modelName ?? null,
      canUseModel: runtimeAgentRequiresModel,
    }));
  }

  return traceSteps;
};

export const createManagedContextDebugReporter = ({
  result,
  mode,
  contextEngineId,
  contextWindow,
  runtimeAgentId,
  providerName,
  modelName,
  onDebugSnapshot,
}: ManagedContextDebugReporterInput): ReportContextDebugUpdate => ({
  payloads,
  ...overrides
}) => {
  onDebugSnapshot(buildContextDebugSnapshot({
    base: result.debugSnapshot,
    mode,
    engineId: contextEngineId,
    contextWindow,
    runtimeAgentId,
    providerName,
    modelName,
    payloads: [
      ...result.debugSnapshot.payloads,
      ...payloads,
    ],
    overrides,
  }));
};

export const finalizeManagedAssistantTurn = async ({
  contextSession,
  nextSessionId,
  contextEngineId,
  contextBeforeFinalize,
  modelContext,
  runtimeAgentRequiresModel,
  nextConversation,
  assistantMessageId,
  mode,
  assistantText,
  assistantMessages,
  resultConversationSummary,
  startedAt,
  providerName,
  modelName,
}: FinalizeManagedAssistantTurnInput): Promise<FinalizedManagedAssistantTurn> => {
  const finalConversation: ConversationMessage[] = [
    ...nextConversation,
    ...(assistantMessages && assistantMessages.length > 0
      ? assistantMessages
      : [{
        id: assistantMessageId,
        role: "assistant" as const,
        content: assistantText,
        timestamp: Date.now(),
      }]),
  ];

  contextSession.set({
    chatId: nextSessionId,
    engineId: contextEngineId,
    context: contextBeforeFinalize,
    modelContext,
    canUseModel: runtimeAgentRequiresModel,
  });
  const finalContext = await contextSession.finalizeChatTurn({
    conversation: finalConversation,
  });
  const traceSteps: ChatTraceStepInput[] = [];

  if (didConversationContextCompress(contextBeforeFinalize, finalContext)) {
    traceSteps.push(contextCompressionTraceStep({
      startedAt,
      previousContext: contextBeforeFinalize,
      nextContext: finalContext,
      conversationLength: finalConversation.length,
      mode,
      phase: "finalize",
      engineId: contextEngineId,
      providerName: providerName ?? null,
      modelName: modelName ?? null,
      canUseModel: runtimeAgentRequiresModel,
    }));
  }

  traceSteps.push({
    type: "context",
    label: "上下文回写",
    status: "done",
    content: finalContext?.summary ?? "（空）",
    metadata: {
      mode,
      conversationLength: finalConversation.length,
    },
  });

  return {
    finalConversation,
    finalContext,
    conversationSummary: finalContext?.summary ?? resultConversationSummary,
    traceSteps,
  };
};
