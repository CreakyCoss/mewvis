import type {
  PromptContextFile,
} from "@/features/ai/runtime";
import type { Workspace } from "@/features/workspace/types";
import type { ChatContextSummary } from "../../types";
import { createBridgeSessionRootDir } from "../../utils/sessions";
import type {
  AppendVisibleTraceStep,
  PatchVisibleTraceTurn,
} from "./modes/types";
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
  runtimeAgentId: string;
  nextSessionId: string | null;
  traceTurnId: string;
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
  contextWindow: number;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
};

export type BridgeAgentTurnRuntimeResult = {
  agentPromptPayload: BridgeAgentPromptPayload;
  nextConversationContext: ChatContextSummary | null;
  activeFile: PromptContextFile | null;
};

export const prepareBridgeAgentTurnRuntime = async ({
  workspace,
  runtimeAgentId,
  nextSessionId,
  traceTurnId,
  text,
  referencedFiles,
  activeFile,
  activeSkills,
  selectedAgent,
  agentInstructions,
  executionMemorySummary,
  contextWindow,
  appendVisibleTraceStep,
  patchVisibleTraceTurn,
}: BridgeAgentTurnRuntimeInput): Promise<BridgeAgentTurnRuntimeResult> => {
  const sessionRootDir = createBridgeSessionRootDir(nextSessionId);
  if (!sessionRootDir) {
    throw new Error("无法创建 bridge 上下文目录，请重试");
  }
  const selectedAgentForBridge = selectedAgent;
  if (!selectedAgentForBridge?.id?.trim()) {
    throw new Error("Agent 模式必须选择稳定角色 id");
  }
  const bridgeSelectedAgent = {
    id: selectedAgentForBridge.id.trim(),
    name: selectedAgentForBridge.name,
    description: selectedAgentForBridge.description ?? null,
  };

  const prepareStartedAt = Date.now();
  const { systemPrompt, requestContext, runtimeInstruction } = await buildApplicationPromptParts({
    workspace,
    text,
    activeFile,
    referencedFiles,
    activeSkills,
    selectedAgent: bridgeSelectedAgent,
    executionMemorySummary,
    trailingSections: [
      agentInstructions.trim(),
      "Bridge 会在 agent 消息中基于 agentRoleId 注入本会话账本历史；这里的 active_file、user_referenced_files 和 active_skills 只作为应用侧资料上下文。",
    ],
  });

  const conversationContext: ChatContextSummary | null = null;
  const agentSessionStatusId = `${runtimeAgentId}/${bridgeSelectedAgent.id}`;
  const agentPromptPayload: BridgeAgentPromptPayload = {
    agentRoleId: bridgeSelectedAgent.id,
    systemPrompt,
    userMessage: text,
    requestContext,
    runtimeInstruction,
  };
  const basePayloads = [
    {
      label: "systemPrompt",
      content: systemPrompt,
    },
    {
      label: "requestContext",
      content: requestContext,
    },
    {
      label: "runtimeInstruction",
      content: runtimeInstruction,
    },
    {
      label: "userMessage",
      content: text,
    },
  ];
  patchVisibleTraceTurn(traceTurnId, {
    contextEngineId: "bridge-ledger",
    contextWindow,
    conversationSummary: "",
    agentSessionId: agentSessionStatusId,
  });
  appendVisibleTraceStep(traceTurnId, {
    type: "context",
    label: "应用 Agent 请求上下文准备",
    startedAt: prepareStartedAt,
    endedAt: Date.now(),
    status: "done",
    content: requestContext,
    metadata: {
      sessionRootDir,
      agentRoleId: bridgeSelectedAgent.id,
      agentSessionId: agentSessionStatusId,
      source: "app-request-context",
    },
    payloads: basePayloads,
  });

  return {
    agentPromptPayload,
    nextConversationContext: conversationContext,
    activeFile: null,
  };
};
