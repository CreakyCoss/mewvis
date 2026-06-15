import {
  createAgentMemoryTrace,
} from "@/ai/agent-runtime/memory";
import {
  normalizeAllowedRuntimeAgentTools,
} from "@/ai/runtime-protocol";
import { requireRuntimeModelInput } from "@/features/ai/llm/store";
import {
  filterChatAgentAllowedTools,
} from "../../../utils/chat-mode";
import {
  formatAgentInitialPromptPreview,
  formatDebugMessages,
} from "../trace";
import type {
  RunAgentTurnDeps,
  RunAgentTurnInput,
} from "./types";

export const runAgentTurn = async (
  {
    nextSessionId,
    traceTurnId,
    assistantMessageId,
    nextConversation,
    nextConversationContext,
    nextMessages,
    conversationSummary,
    knowledgeDebugPayload,
    publishContextDebugSnapshot,
    agentPromptPayload,
  }: RunAgentTurnInput,
  {
    workspace,
    activeSkills,
    runtimeAgentId,
    appendVisibleTraceStep,
    updateMessage,
    agentRuntime,
    setChatError,
    prepareActiveAgentRun,
    patchVisibleTraceTurn,
    addRunningAgentTask,
    activateAgentTaskId,
    agentSessionResetPromiseRef,
    handledAgentDoneTaskIdsRef,
    chatTraceRef,
    effectiveRuntimeModel,
    chatMode,
    chatExecutionMode,
    allowedAgentTools,
    currentSessionTitle,
  }: RunAgentTurnDeps,
) => {
  const runtimeModelInput = effectiveRuntimeModel
    ? requireRuntimeModelInput(effectiveRuntimeModel)
    : null;
  if (!nextSessionId) {
    setChatError("无法创建 Agent 长期上下文，请重试");
    return;
  }

  if (agentSessionResetPromiseRef.current) {
    const resetSucceeded = await agentSessionResetPromiseRef.current;
    if (!resetSucceeded) {
      throw new Error("无法重置旧 Agent 长期上下文，已停止本次运行以避免复用旧记忆。");
    }
  }
  const agentSessionId = agentPromptPayload.agentSessionId;
  patchVisibleTraceTurn(traceTurnId, {
    agentSessionId,
  });
  const taskTrace = createAgentMemoryTrace();
  prepareActiveAgentRun({
    messageId: assistantMessageId,
    agentSessionId,
    agentId: runtimeAgentId,
    trace: taskTrace,
  });
  const allowedToolsForRun = normalizeAllowedRuntimeAgentTools(
    chatMode === "chat" && chatExecutionMode === "agent"
      ? filterChatAgentAllowedTools(allowedAgentTools)
      : allowedAgentTools,
  );
  publishContextDebugSnapshot([
    knowledgeDebugPayload,
    {
      label: "bridge initial prompt",
      content: formatAgentInitialPromptPreview(
        agentPromptPayload.bootstrapContext,
        agentPromptPayload.prompt,
        agentPromptPayload.shouldBootstrapAgentContext,
      ),
    },
    {
      label: "bootstrapContext",
      content: agentPromptPayload.bootstrapContext || "（空）",
    },
    {
      label: "prompt",
      content: agentPromptPayload.prompt,
    },
    {
      label: "prompt recent_conversation",
      content: formatDebugMessages(agentPromptPayload.promptHistory.recentMessages),
    },
    {
      label: "bootstrap recent_conversation",
      content: formatDebugMessages(agentPromptPayload.bootstrapHistory.recentMessages),
    },
  ], {
    mode: chatMode,
    agentSessionId,
    providerName: effectiveRuntimeModel?.provider.name ?? null,
    modelName: effectiveRuntimeModel?.modelName ?? null,
    conversationSummary: agentPromptPayload.promptHistory.summary ||
      agentPromptPayload.bootstrapHistory.summary ||
      conversationSummary,
    runtimeMessages: agentPromptPayload.promptHistory.recentMessages,
  });
  appendVisibleTraceStep(traceTurnId, {
    type: "request",
    label: "Agent bridge 请求",
    status: "done",
    content: agentPromptPayload.prompt,
    metadata: {
      agentSessionId,
      agentId: runtimeAgentId,
      providerName: effectiveRuntimeModel?.provider.name ?? null,
      modelName: effectiveRuntimeModel?.modelName ?? null,
      shouldBootstrapAgentContext: agentPromptPayload.shouldBootstrapAgentContext,
      allowedTools: allowedToolsForRun,
      activeSkills: activeSkills.map((skill) => skill.name),
    },
    payloads: [
      {
        label: "bootstrapContext",
        content: agentPromptPayload.bootstrapContext || "（空）",
      },
      {
        label: "prompt recent_conversation",
        content: formatDebugMessages(agentPromptPayload.promptHistory.recentMessages),
      },
      {
        label: "bootstrap recent_conversation",
        content: formatDebugMessages(agentPromptPayload.bootstrapHistory.recentMessages),
      },
    ],
  });
  const agentRunStartedAt = Date.now();
  const task = await agentRuntime.run({
    type: "agent",
    agentId: runtimeAgentId,
    workspacePath: workspace.path,
    chatSessionId: agentSessionId,
    bootstrapContext: agentPromptPayload.bootstrapContext,
    prompt: agentPromptPayload.prompt,
    runtimeModel: runtimeModelInput ?? undefined,
    allowedTools: allowedToolsForRun,
    enabledSkills: activeSkills.map((skill) => skill.name),
  });
  handledAgentDoneTaskIdsRef.current.delete(task.taskId);
  appendVisibleTraceStep(traceTurnId, {
    type: "agent_event",
    label: "Agent 任务创建",
    startedAt: agentRunStartedAt,
    endedAt: Date.now(),
    status: "done",
    metadata: {
      taskId: task.taskId,
      agentSessionId,
      agentId: runtimeAgentId,
    },
  });
  addRunningAgentTask({
    taskId: task.taskId,
    workspacePath: workspace.path,
    sessionId: nextSessionId,
    title: currentSessionTitle,
    messageId: assistantMessageId,
    traceTurnId,
    chatTrace: chatTraceRef.current,
    agentSessionId,
    agentId: runtimeAgentId,
    trace: taskTrace,
    messages: nextMessages,
    conversation: nextConversation,
    context: nextConversationContext,
    pendingQuestion: null,
    questionAnswer: "",
    customQuestionAnswer: "",
    lastError: "",
    lastStderr: "",
    handledTerminal: false,
  });
  activateAgentTaskId(task.taskId);
  updateMessage(assistantMessageId, (message) => ({
    ...message,
    status: "streaming",
  }));
};
