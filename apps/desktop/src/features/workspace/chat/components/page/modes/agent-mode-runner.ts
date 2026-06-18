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
import { createBridgeSessionRootDir } from "../../../utils/sessions";
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
    reportContextDebugUpdate,
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

  const agentRoleId = agentPromptPayload.agentRoleId;
  const agentSessionStatusId = `${runtimeAgentId}/${agentRoleId}`;
  patchVisibleTraceTurn(traceTurnId, {
    agentSessionId: agentSessionStatusId,
  });
  const taskTrace = createAgentMemoryTrace();
  prepareActiveAgentRun({
    messageId: assistantMessageId,
    agentSessionId: agentSessionStatusId,
    agentId: runtimeAgentId,
    trace: taskTrace,
  });
  const allowedToolsForRun = normalizeAllowedRuntimeAgentTools(
    chatMode === "chat" && chatExecutionMode === "agent"
      ? filterChatAgentAllowedTools(allowedAgentTools)
      : allowedAgentTools,
  );
  reportContextDebugUpdate({
    agentSessionId: agentSessionStatusId,
    providerName: effectiveRuntimeModel?.provider.name ?? null,
    modelName: effectiveRuntimeModel?.modelName ?? null,
    conversationSummary,
    runtimeMessages: [],
    payloads: [
      {
        label: "systemPrompt",
        content: agentPromptPayload.systemPrompt,
      },
      {
        label: "requestContext",
        content: agentPromptPayload.requestContext,
      },
      {
        label: "runtimeInstruction",
        content: agentPromptPayload.runtimeInstruction,
      },
      {
        label: "bootstrapInstruction",
        content: agentPromptPayload.bootstrapInstruction ?? "",
      },
      {
        label: "userMessage",
        content: agentPromptPayload.userMessage,
      },
    ],
  });
  appendVisibleTraceStep(traceTurnId, {
    type: "request",
    label: "Agent bridge 请求",
    status: "done",
    content: agentPromptPayload.userMessage,
    metadata: {
      agentRoleId,
      agentSessionId: agentSessionStatusId,
      agentId: runtimeAgentId,
      providerName: effectiveRuntimeModel?.provider.name ?? null,
      modelName: effectiveRuntimeModel?.modelName ?? null,
      allowedTools: allowedToolsForRun,
      activeSkills: activeSkills.map((skill) => skill.name),
    },
    payloads: [
      {
        label: "systemPrompt",
        content: agentPromptPayload.systemPrompt,
      },
      {
        label: "requestContext",
        content: agentPromptPayload.requestContext,
      },
      {
        label: "runtimeInstruction",
        content: agentPromptPayload.runtimeInstruction,
      },
      {
        label: "bootstrapInstruction",
        content: agentPromptPayload.bootstrapInstruction ?? "",
      },
      {
        label: "userMessage",
        content: agentPromptPayload.userMessage,
      },
    ],
  });
  const agentRunStartedAt = Date.now();
  const task = await agentRuntime.run({
    type: "agent",
    agentId: runtimeAgentId,
    workspacePath: workspace.path,
    sessionRootDir: createBridgeSessionRootDir(nextSessionId),
    agentRoleId,
    userMessage: agentPromptPayload.userMessage,
    systemPrompt: agentPromptPayload.systemPrompt,
    requestContext: agentPromptPayload.requestContext,
    runtimeInstruction: agentPromptPayload.runtimeInstruction,
    bootstrapInstruction: agentPromptPayload.bootstrapInstruction ?? null,
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
      agentRoleId,
      agentSessionId: agentSessionStatusId,
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
    agentSessionId: agentSessionStatusId,
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
