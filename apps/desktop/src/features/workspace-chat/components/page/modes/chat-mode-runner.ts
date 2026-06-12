import {
  buildSystemPrompt,
} from "@/ai/agent-context";
import { runSharedRuntimeChat } from "@/features/shared-chat-runtime";
import {
  formatDebugMessages,
} from "../trace";
import { createMessageStreamAccumulator } from "./shared";
import type {
  RunChatTurnDeps,
  RunChatTurnInput,
} from "./types";

export const runChatTurn = async (
  {
    traceTurnId,
    assistantMessageId,
    text,
    referencedFiles,
    runtimeMessages,
    conversationSummary,
    currentAgentExecutionSummary,
    knowledgeMatches,
    knowledgeDebugPayload,
    limitsFor,
    publishContextDebugSnapshot,
    finalizeAssistantTurn,
  }: RunChatTurnInput,
  {
    workspace,
    activeFile,
    enabledSkills,
    runtimeAgentId,
    appendVisibleTraceStep,
    updateMessage,
    modelSource,
    selectedAgent,
    effectiveRuntimeModel,
  }: RunChatTurnDeps,
) => {
  const systemPrompt = buildSystemPrompt(
    workspace,
    activeFile,
    referencedFiles,
    enabledSkills,
    modelSource === "agent" ? selectedAgent : null,
    {
      limits: limitsFor(effectiveRuntimeModel),
      conversationSummary,
      agentExecutionSummary: currentAgentExecutionSummary,
      contextQuery: text,
      knowledgeMatches,
    },
  );
  publishContextDebugSnapshot([
    knowledgeDebugPayload,
    { label: "systemPrompt", content: systemPrompt },
    { label: "messages", content: formatDebugMessages(runtimeMessages) },
  ]);
  const chatRequestStartedAt = Date.now();
  let hasLoggedStreamStart = false;
  appendVisibleTraceStep(traceTurnId, {
    type: "request",
    label: "模型请求",
    status: "done",
    content: systemPrompt,
    metadata: {
      providerName: effectiveRuntimeModel?.provider.name ?? null,
      modelName: effectiveRuntimeModel?.modelName ?? null,
      stream: true,
      runtimeMessageCount: runtimeMessages.length,
    },
    payloads: [
      {
        label: "messages",
        content: formatDebugMessages(runtimeMessages),
      },
    ],
  });

  const streamAccumulator = createMessageStreamAccumulator({
    messageId: assistantMessageId,
    updateMessage,
  });
  const result = await runSharedRuntimeChat({
    agentId: runtimeAgentId,
    runtimeModel: effectiveRuntimeModel?.runtimeInput ?? null,
    systemPrompt,
    messages: runtimeMessages,
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
  const assistantText = result.text.trim();
  appendVisibleTraceStep(traceTurnId, {
    type: "response",
    label: "模型响应",
    startedAt: chatRequestStartedAt,
    endedAt: Date.now(),
    status: "done",
    content: assistantText,
    metadata: {
      thinkingLength: result.thinking?.length ?? 0,
      textLength: assistantText.length,
    },
    payloads: result.thinking?.trim()
      ? [{ label: "thinking", content: result.thinking.trim() }]
      : undefined,
  });

  updateMessage(assistantMessageId, (message) => ({
    ...message,
    text: assistantText,
    thinking: result.thinking?.trim() || undefined,
    status: "done",
  }));
  await finalizeAssistantTurn({
    mode: "chat",
    assistantText,
  });
};
