import type { MutableRefObject } from "react";
import type { AgentClient } from "@/agent-client/types";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import { createAgentSessionRootDir } from "../../utils/sessions";
import type { ChatMessage } from "../../types";
import type { WorkspacePromptSkillContext } from "./prompt-context";
import type { RunningAgentTaskContext } from "./use-running-agent-tasks";

type UpdateMessage = (messageId: string, updater: (message: ChatMessage) => ChatMessage) => void;

type PrepareActiveAgentRun = (input: { messageId: string }) => void;

type RunAgentTurnInput = {
  nextSessionId: string | null;
  assistantMessageId: string;
  nextMessages: ChatMessage[];
  agentPromptPayload: {
    agentRoleId: string;
    systemPrompt: string;
    requestContext: string;
    runtimeInstruction: string;
    bootstrapInstruction?: string | null;
    userMessage: string;
  };
};

type RunAgentTurnDeps = {
  workspace: Workspace;
  activeSkills: WorkspacePromptSkillContext[];
  updateMessage: UpdateMessage;
  agentClient: AgentClient;
  setChatError: (message: string) => void;
  prepareActiveAgentRun: PrepareActiveAgentRun;
  addRunningAgentTask: (task: RunningAgentTaskContext) => void;
  activateAgentTaskId: (taskId: string) => void;
  handledAgentDoneTaskIdsRef: MutableRefObject<Set<string>>;
  effectiveRuntimeModel: RuntimeModelOption | null;
  allowedAgentTools: string[];
  currentSessionTitle: string;
};

export const runAgentTurn = async (
  { nextSessionId, assistantMessageId, nextMessages, agentPromptPayload }: RunAgentTurnInput,
  {
    workspace,
    activeSkills,
    updateMessage,
    agentClient,
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
  const runtimeModelInput = effectiveRuntimeModel ? requireRuntimeModelInput(effectiveRuntimeModel) : null;
  if (!nextSessionId) {
    setChatError("无法创建 Agent 长期上下文，请重试");
    return;
  }

  const agentRoleId = agentPromptPayload.agentRoleId;
  prepareActiveAgentRun({
    messageId: assistantMessageId,
  });
  const allowedToolsForRun = [...new Set(allowedAgentTools)];
  const task = await agentClient.agent.run({
    workspacePath: workspace.path,
    sessionRootDir: createAgentSessionRootDir(nextSessionId),
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
    agentSessionId: agentRoleId,
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
