import type { Workspace } from "@/features/pages/workspace/types";
import { createBridgeSessionRootDir } from "../../utils/sessions";
import { buildApplicationPromptParts } from "./application-system-prompt";

export type BridgeAgentPromptPayload = {
  agentRoleId: string;
  systemPrompt: string;
  requestContext: string;
  runtimeInstruction: string;
  userMessage: string;
};

type BridgeAgentTurnRuntimeInput = {
  workspace: Workspace;
  nextSessionId: string | null;
  text: string;
  referencedFiles: Array<{ path: string }>;
  activeFile: { path: string } | null;
  activeSkills: Array<{
    name: string;
    content: string;
    description?: string | null;
  }>;
  selectedAgent: { id?: string | null; name: string; description?: string | null } | null;
  agentInstructions: string;
  executionMemorySummary: string;
};

export type BridgeAgentTurnRuntimeResult = {
  agentPromptPayload: BridgeAgentPromptPayload;
};

export const prepareBridgeAgentTurnRuntime = async ({
  workspace,
  nextSessionId,
  text,
  referencedFiles,
  activeFile,
  activeSkills,
  selectedAgent,
  agentInstructions,
  executionMemorySummary,
}: BridgeAgentTurnRuntimeInput): Promise<BridgeAgentTurnRuntimeResult> => {
  const sessionRootDir = createBridgeSessionRootDir(nextSessionId);
  if (!sessionRootDir) {
    throw new Error("无法创建 bridge 上下文目录，请重试");
  }
  const conversationAgentRoleId = nextSessionId?.trim();
  if (!conversationAgentRoleId) {
    throw new Error("无法创建稳定的聊天上下文 id，请重试");
  }
  const { systemPrompt, requestContext, runtimeInstruction } = await buildApplicationPromptParts({
    workspace,
    text,
    activeFile,
    referencedFiles,
    activeSkills,
    selectedAgent,
    executionMemorySummary,
    trailingSections: [
      agentInstructions.trim(),
      "Bridge 会在 agent 消息中基于 agentRoleId 注入本会话账本历史；这里的 active_file、user_referenced_files 和 active_skills 只作为应用侧资料上下文。",
    ],
  });

  const agentPromptPayload: BridgeAgentPromptPayload = {
    agentRoleId: conversationAgentRoleId,
    systemPrompt,
    userMessage: text,
    requestContext,
    runtimeInstruction,
  };

  return {
    agentPromptPayload,
  };
};
