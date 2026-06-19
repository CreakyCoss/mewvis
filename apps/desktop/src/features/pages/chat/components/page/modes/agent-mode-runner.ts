import {
  normalizeAllowedRuntimeAgentTools,
} from "@/ai/runtime-protocol";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import { createBridgeSessionRootDir } from "../../../utils/sessions";
import type {
  RunAgentTurnDeps,
  RunAgentTurnInput,
} from "./types";

export const runAgentTurn = async (
  {
    nextSessionId,
    assistantMessageId,
    nextMessages,
    agentPromptPayload,
  }: RunAgentTurnInput,
  {
    workspace,
    activeSkills,
    runtimeAgentId,
    updateMessage,
    agentRuntime,
    setChatError,
    prepareActiveAgentRun,
    addRunningAgentTask,
    activateAgentTaskId,
    handledAgentDoneTaskIdsRef,
    effectiveRuntimeModel,
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
  prepareActiveAgentRun({
    messageId: assistantMessageId,
  });
  const allowedToolsForRun = normalizeAllowedRuntimeAgentTools(
    allowedAgentTools,
  );
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
  addRunningAgentTask({
    taskId: task.taskId,
    workspacePath: workspace.path,
    sessionId: nextSessionId,
    title: currentSessionTitle,
    messageId: assistantMessageId,
    agentSessionId: agentSessionStatusId,
    agentId: runtimeAgentId,
    messages: nextMessages,
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
