import type {
  PromptContextFile,
} from "@/ai/context";
import type { Workspace } from "@/features/workspace/types";
import type {
  ChatContextSummary,
  ConversationMessage,
} from "../../types";
import type {
  ChatMode,
  ContextDebugSnapshot,
} from "../../page-types";
import { createBridgeSessionRootDir } from "../../utils/sessions";
import type {
  AppendVisibleTraceStep,
  PatchVisibleTraceTurn,
  ReportContextDebugUpdate,
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
  chatMode: ChatMode;
  runtimeAgentId: string;
  traceProviderName: string | null;
  traceModelName: string | null;
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
  onDebugSnapshot(snapshot: ContextDebugSnapshot): void;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
};

export type BridgeAgentTurnRuntimeResult = {
  agentPromptPayload: BridgeAgentPromptPayload;
  nextConversationContext: ChatContextSummary | null;
  conversationSummary: string;
  activeFile: PromptContextFile | null;
  reportContextDebugUpdate: ReportContextDebugUpdate;
};

export const prepareBridgeAgentTurnRuntime = async ({
  workspace,
  chatMode,
  runtimeAgentId,
  traceProviderName,
  traceModelName,
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
  onDebugSnapshot,
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
  const runtimeMessages: ConversationMessage[] = [];

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
      runtimeMessageCount: runtimeMessages.length,
      source: "app-request-context",
    },
    payloads: basePayloads,
  });

  const buildSnapshot = (
    payloads = basePayloads,
    overrides: Partial<ContextDebugSnapshot> = {},
  ): ContextDebugSnapshot => ({
    id: traceTurnId,
    turnId: traceTurnId,
    chatId: nextSessionId,
    updatedAt: Date.now(),
    mode: chatMode,
    engineId: "bridge-ledger",
    contextWindow,
    runtimeAgentId,
    agentSessionId: agentSessionStatusId,
    providerName: traceProviderName,
    modelName: traceModelName,
    activeFilePath: activeFile?.path ?? null,
    referencedFilePaths: referencedFiles.map((file) => file.path),
    activeSkillNames: activeSkills.map((skill) => skill.name),
    selectedAgentId: bridgeSelectedAgent.id,
    selectedAgentName: selectedAgent?.name ?? null,
    conversationSummary: "",
    runtimeMessages,
    knowledgeMatches: [],
    systemPrompt,
    payloads,
    ...overrides,
  });

  onDebugSnapshot(buildSnapshot());

  const reportContextDebugUpdate: ReportContextDebugUpdate = ({
    payloads,
    ...overrides
  }) => {
    onDebugSnapshot(buildSnapshot([
      ...basePayloads,
      ...payloads,
    ], overrides));
  };

  return {
    agentPromptPayload,
    nextConversationContext: conversationContext,
    conversationSummary: "",
    activeFile: null,
    reportContextDebugUpdate,
  };
};
