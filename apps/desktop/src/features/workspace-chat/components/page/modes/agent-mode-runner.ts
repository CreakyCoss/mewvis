import {
  createAgentMemoryTrace,
} from "@/ai/agent-context";
import {
  normalizeAllowedAgentTools,
} from "@/ai/agent-runtime/contracts";
import { toAgentRuntimeProviderConfig } from "@/ai/agent-runtime/config";
import { getAgentSessionStatus } from "../../../api";
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
    text,
    referencedFiles,
    baseConversation,
    baseConversationContext,
    nextConversation,
    nextConversationContext,
    nextMessages,
    conversationSummary,
    knowledgeMatches,
    knowledgeDebugPayload,
    limitsFor,
    publishContextDebugSnapshot,
  }: RunAgentTurnInput,
  {
    workspace,
    enabledSkills,
    runtimeAgentId,
    appendVisibleTraceStep,
    updateMessage,
    agentRuntime,
    contextEngine,
    runtimeModelFor,
    setChatError,
    setAgentSessionStatus,
    setAgentSessionError,
    prepareActiveAgentRun,
    patchVisibleTraceTurn,
    addRunningAgentTask,
    activateAgentTaskId,
    agentContextInvalidatedRef,
    agentSessionResetPromiseRef,
    handledAgentDoneTaskIdsRef,
    chatTraceRef,
    agentSessionStatus,
    effectiveProvider,
    effectiveModel,
    modelSource,
    selectedAgent,
    chatMode,
    chatExecutionMode,
    allowedAgentTools,
    currentSessionTitle,
  }: RunAgentTurnDeps,
) => {
  if (!nextSessionId) {
    setChatError("无法创建 Agent 长期上下文，请重试");
    return;
  }

  const agentLimits = limitsFor(effectiveProvider, effectiveModel);
  const agentSessionPlan = contextEngine.planAgentRun({
    chatSessionId: nextSessionId,
    conversation: baseConversation,
    currentContext: baseConversationContext,
    agentId: runtimeAgentId,
    tokenBudget: agentLimits.recentHistoryTokens,
    isHistoryInvalidated: agentContextInvalidatedRef.current,
  });
  const agentSessionId = agentSessionPlan.agentSessionId;
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
  if (agentSessionResetPromiseRef.current) {
    const resetSucceeded = await agentSessionResetPromiseRef.current;
    if (!resetSucceeded) {
      throw new Error("无法重置旧 Agent 长期上下文，已停止本次运行以避免复用旧记忆。");
    }
  }
  let currentAgentSessionStatus = agentSessionStatus;
  try {
    currentAgentSessionStatus = await getAgentSessionStatus(workspace.path, agentSessionId);
    setAgentSessionStatus(currentAgentSessionStatus);
  } catch (caught) {
    setAgentSessionError(String(caught));
  }
  const agentPromptPayload = contextEngine.buildAgentPromptPayload({
    conversation: baseConversation,
    currentContext: baseConversationContext,
    sessionPlan: agentSessionPlan,
    agentSessionStatus: currentAgentSessionStatus,
    text,
    references: referencedFiles,
    knowledgeMatches,
    selectedAgent: modelSource === "agent" ? selectedAgent : null,
    limits: agentLimits,
  });
  const allowedToolsForRun = normalizeAllowedAgentTools(
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
    providerName: effectiveProvider?.name ?? null,
    modelName: effectiveModel?.modelName ?? null,
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
      providerName: effectiveProvider?.name ?? null,
      modelName: effectiveModel?.modelName ?? null,
      shouldBootstrapAgentContext: agentPromptPayload.shouldBootstrapAgentContext,
      allowedTools: allowedToolsForRun,
      enabledSkills: enabledSkills.map((skill) => skill.name),
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
    provider: effectiveProvider ? toAgentRuntimeProviderConfig(effectiveProvider) : undefined,
    model: effectiveProvider && effectiveModel
      ? runtimeModelFor(effectiveProvider, effectiveModel)
      : undefined,
    allowedTools: allowedToolsForRun,
    enabledSkills: enabledSkills.map((skill) => skill.name),
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
