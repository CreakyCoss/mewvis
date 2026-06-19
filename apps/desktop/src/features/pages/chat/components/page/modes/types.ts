import type { MutableRefObject } from "react";
import type {
  RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import type { AgentRuntime } from "@/ai/agent-runtime/runtime";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import type {
  ChatMessage,
} from "../../../types";
import type { RunningAgentTaskContext } from "../agent-task";
import type { WorkspacePromptSkillContext } from "../prompt-context";

export type UpdateMessage = (
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
) => void;

export type PrepareActiveAgentRun = (input: {
  messageId: string;
}) => void;

export type CommonModeDeps = {
  workspace: Workspace;
  activeSkills: WorkspacePromptSkillContext[];
  runtimeAgentId: string;
  updateMessage: UpdateMessage;
};

export type RunAgentTurnInput = {
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

export type RunAgentTurnDeps = CommonModeDeps & {
  agentRuntime: AgentRuntime;
  setChatError: (message: string) => void;
  prepareActiveAgentRun: PrepareActiveAgentRun;
  addRunningAgentTask: (task: RunningAgentTaskContext) => void;
  activateAgentTaskId: (taskId: string) => void;
  handledAgentDoneTaskIdsRef: MutableRefObject<Set<string>>;
  effectiveRuntimeModel: RuntimeModelOption | null;
  allowedAgentTools: RuntimeAgentToolName[];
  currentSessionTitle: string;
};
