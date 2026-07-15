import type { MutableRefObject } from "react";
import { uniq } from "lodash-es";
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
  removeRunningAgentTask: (taskId: string) => void;
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
    removeRunningAgentTask,
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
  const taskId = crypto.randomUUID();
  prepareActiveAgentRun({
    messageId: assistantMessageId,
  });
  const allowedToolsForRun = uniq(allowedAgentTools);
  handledAgentDoneTaskIdsRef.current.delete(taskId);
  addRunningAgentTask({
    taskId,
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
  activateAgentTaskId(taskId);
  updateMessage(assistantMessageId, (message) => ({
    ...message,
    status: "streaming",
  }));

  try {
    await agentClient.agent.run({
      taskId,
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
  } catch (error) {
    removeRunningAgentTask(taskId);
    throw error;
  }
};
