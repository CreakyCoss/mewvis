import type {
  AgentContextSessionPromptInput,
  AgentContextSessionPromptResult,
  AgentContextSessionStateWriter,
  AgentContextSessionTurnRunner,
  ChatContextSummary,
  ConversationMessage,
  ConversationSummarizer,
  PromptAgentProfile,
  PromptContextModel,
  PromptSkillContext,
} from "@/ai/agent-context";
import { runSharedRuntimeChat } from "@/features/ai/runtime";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/ai/llm/store";
import type { Workspace } from "@/features/workspace/types";
import type {
  ChatMode,
  ContextDebugSnapshot,
} from "../../page-types";
import {
  contextCompressionTraceStep,
  didConversationContextCompress,
  formatDebugMessages,
  mapSessionPromptTraceSteps,
} from "./trace";
import { buildContextDebugSnapshot } from "./context-debug";
import { createMessageStreamAccumulator } from "./modes/shared";
import type {
  AppendVisibleTraceStep,
  PatchVisibleTraceTurn,
  UpdateMessage,
} from "./modes/types";
import { buildWorkspaceSystemPrompt } from "./modes/workspace-system-prompt";

export type DirectTurnContextSession =
  AgentContextSessionStateWriter &
  AgentContextSessionTurnRunner;

export type RunDirectChatTurnRuntimeInput = {
  contextSession: DirectTurnContextSession;
  workspace: Workspace;
  contextEngineId: string;
  effectiveAppContextWindow: number;
  runtimeAgentRequiresModel: boolean;
  contextModelFor: (runtimeModel?: RuntimeModelOption | null) => PromptContextModel;
  summarizerFor: (runtimeModel?: RuntimeModelOption | null) => ConversationSummarizer | null;
  searchKnowledge?: AgentContextSessionPromptInput["searchKnowledge"];
  chatMode: ChatMode;
  runtimeAgentId: string;
  effectiveRuntimeModel: RuntimeModelOption | null;
  traceProviderName: string | null;
  traceModelName: string | null;
  nextSessionId: string | null;
  userMessageId: string;
  assistantMessageId: string;
  traceTurnId: string;
  text: string;
  referencedFiles: Array<{ path: string }>;
  activeFile: AgentContextSessionPromptInput["activeFile"];
  activeSkills: PromptSkillContext[];
  selectedAgent: PromptAgentProfile | null;
  baseConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  executionMemorySummary: string;
  onPreparedContext(context: ChatContextSummary | null): void;
  onDebugSnapshot(snapshot: ContextDebugSnapshot): void;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
  updateMessage: UpdateMessage;
};

export const runDirectChatTurnRuntime = async ({
  contextSession,
  workspace,
  contextEngineId,
  effectiveAppContextWindow,
  runtimeAgentRequiresModel,
  contextModelFor,
  summarizerFor,
  searchKnowledge,
  chatMode,
  runtimeAgentId,
  effectiveRuntimeModel,
  traceProviderName,
  traceModelName,
  nextSessionId,
  userMessageId,
  assistantMessageId,
  traceTurnId,
  text,
  referencedFiles,
  activeFile,
  activeSkills,
  selectedAgent,
  baseConversation,
  baseConversationContext,
  executionMemorySummary,
  onPreparedContext,
  onDebugSnapshot,
  appendVisibleTraceStep,
  patchVisibleTraceTurn,
  updateMessage,
}: RunDirectChatTurnRuntimeInput): Promise<AgentContextSessionPromptResult> => {
  const summaryModelContext = contextModelFor(effectiveRuntimeModel);
  const summarySummarizer = summarizerFor(effectiveRuntimeModel);
  const runtimeModelInput = effectiveRuntimeModel
    ? requireRuntimeModelInput(effectiveRuntimeModel)
    : null;
  const contextWindow = summaryModelContext.contextWindow ?? effectiveAppContextWindow;
  let didPublishPreparationTrace = false;

  contextSession.set({
    chatId: nextSessionId,
    engineId: contextEngineId,
    context: baseConversationContext,
    modelContext: summaryModelContext,
    summarizer: summarySummarizer,
    canUseModel: runtimeAgentRequiresModel,
    searchKnowledge,
    buildSystemPrompt: (promptInput) => buildWorkspaceSystemPrompt({
      workspace,
      ...promptInput,
    }),
    runPrompt: async (promptInput) => {
      onPreparedContext(promptInput.context);
      patchVisibleTraceTurn(traceTurnId, {
        contextEngineId,
        contextWindow,
        conversationSummary: promptInput.conversationSummary,
      });
      onDebugSnapshot(buildContextDebugSnapshot({
        base: promptInput.debugSnapshot,
        mode: chatMode,
        engineId: contextEngineId,
        contextWindow,
        runtimeAgentId,
        providerName: traceProviderName,
        modelName: traceModelName,
        payloads: promptInput.debugSnapshot.payloads,
      }));

      if (!didPublishPreparationTrace) {
        for (const step of mapSessionPromptTraceSteps(
          promptInput.traceTurn.steps,
          new Set(["上下文文件", "上下文准备", "知识检索"]),
        )) {
          appendVisibleTraceStep(traceTurnId, step);
        }
        didPublishPreparationTrace = true;
      }

      const chatRequestStartedAt = Date.now();
      let hasLoggedStreamStart = false;
      appendVisibleTraceStep(traceTurnId, {
        type: "request",
        label: "模型请求",
        status: "done",
        content: promptInput.systemPrompt,
        metadata: {
          providerName: effectiveRuntimeModel?.provider.name ?? null,
          modelName: effectiveRuntimeModel?.modelName ?? null,
          stream: true,
          runtimeMessageCount: promptInput.runtimeMessages.length,
        },
        payloads: [
          {
            label: "messages",
            content: formatDebugMessages(promptInput.runtimeMessages),
          },
        ],
      });

      const streamAccumulator = createMessageStreamAccumulator({
        messageId: assistantMessageId,
        updateMessage,
      });
      const response = await runSharedRuntimeChat({
        agentId: runtimeAgentId,
        runtimeModel: runtimeModelInput,
        systemPrompt: promptInput.systemPrompt,
        messages: promptInput.runtimeMessages,
        onTextDelta: (delta) => {
          if (!hasLoggedStreamStart) {
            hasLoggedStreamStart = true;
            appendVisibleTraceStep(traceTurnId, {
              type: "stream",
              label: "开始流式输出",
              status: "done",
              content: delta,
            });
          }
          streamAccumulator.appendTextDelta(delta);
        },
        onThinkingDelta: (delta) => {
          if (!hasLoggedStreamStart) {
            hasLoggedStreamStart = true;
            appendVisibleTraceStep(traceTurnId, {
              type: "stream",
              label: "开始流式输出",
              status: "done",
              content: delta,
            });
          }
          streamAccumulator.appendThinkingDelta(delta);
        },
      });
      streamAccumulator.flushPendingStreamDeltas();
      const assistantText = response.text.trim();
      const thinking = response.thinking?.trim() || undefined;
      appendVisibleTraceStep(traceTurnId, {
        type: "response",
        label: "模型响应",
        startedAt: chatRequestStartedAt,
        endedAt: Date.now(),
        status: "done",
        content: assistantText,
        metadata: {
          thinkingLength: thinking?.length ?? 0,
          textLength: assistantText.length,
        },
        payloads: thinking
          ? [{ label: "thinking", content: thinking }]
          : undefined,
      });

      updateMessage(assistantMessageId, (message) => ({
        ...message,
        text: assistantText,
        thinking,
        status: "done",
      }));

      return {
        text: assistantText,
        thinking,
      };
    },
  });

  const result = await contextSession.prompt({
    chatId: nextSessionId,
    id: userMessageId,
    assistantMessageId,
    text,
    conversation: baseConversation,
    references: referencedFiles,
    activeFile,
    activeSkills,
    selectedAgent,
    executionMemorySummary,
  });

  if (didConversationContextCompress(result.previousContext, result.context)) {
    appendVisibleTraceStep(traceTurnId, contextCompressionTraceStep({
      startedAt: Date.now(),
      previousContext: result.previousContext,
      nextContext: result.context,
      conversationLength: result.conversation.length,
      mode: "chat",
      phase: "finalize",
      engineId: contextEngineId,
      providerName: effectiveRuntimeModel?.provider.name ?? null,
      modelName: effectiveRuntimeModel?.modelName ?? null,
      canUseModel: runtimeAgentRequiresModel,
    }));
  }
  for (const step of mapSessionPromptTraceSteps(
    result.traceTurn.steps,
    new Set(["上下文回写"]),
  )) {
    appendVisibleTraceStep(traceTurnId, step);
  }
  patchVisibleTraceTurn(traceTurnId, {
    status: "done",
    conversationSummary: result.conversationSummary,
  });

  return result;
};
