import { runSharedRuntimeChat } from "@/features/ai/runtime";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/ai/components/llm-setting/store";
import type { Workspace } from "@/features/workspace/types";
import {
  readAgentRuntimeSession,
} from "@/features/ai/components/conversation-ledger/api";
import type {
  ChatContextSummary,
  ConversationMessage,
} from "../../types";
import type {
  AppendVisibleTraceStep,
  PatchVisibleTraceTurn,
  UpdateMessage,
} from "./modes/types";
import { createMessageStreamAccumulator } from "./modes/shared";
import { createBridgeSessionRootDir } from "../../utils/sessions";
import { buildApplicationPromptParts } from "./application-system-prompt";

type BridgeDirectTurnRuntimeInput = {
  workspace: Workspace;
  runtimeAgentId: string;
  effectiveRuntimeModel: RuntimeModelOption | null;
  nextSessionId: string | null;
  userMessageId: string;
  assistantMessageId: string;
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
  baseConversation: ConversationMessage[];
  executionMemorySummary: string;
  contextWindow: number;
  modelContext: {
    contextWindow?: number;
    maxTokens?: number;
  };
  appendVisibleTraceStep: AppendVisibleTraceStep;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
  updateMessage: UpdateMessage;
};

export type BridgeDirectTurnRuntimeResult = {
  finalConversation: ConversationMessage[];
  context: ChatContextSummary | null;
};

const contextFromSummary = (summary: string): ChatContextSummary | null => summary
  ? {
    summary,
    summarizedUntilIndex: 0,
    updatedAt: Date.now(),
    conversationFingerprint: null,
    summaryFingerprint: null,
    historyInvalidatedAt: null,
    agentSyncs: {},
  }
  : null;

export const runBridgeDirectChatTurnRuntime = async ({
  workspace,
  runtimeAgentId,
  effectiveRuntimeModel,
  nextSessionId,
  userMessageId,
  assistantMessageId,
  traceTurnId,
  text,
  referencedFiles,
  activeFile,
  activeSkills,
  selectedAgent,
  baseConversation,
  executionMemorySummary,
  contextWindow,
  appendVisibleTraceStep,
  patchVisibleTraceTurn,
  updateMessage,
}: BridgeDirectTurnRuntimeInput): Promise<BridgeDirectTurnRuntimeResult> => {
  const sessionRootDir = createBridgeSessionRootDir(nextSessionId);
  if (!sessionRootDir) {
    throw new Error("无法创建 bridge 上下文目录，请重试");
  }

  const prepareStartedAt = Date.now();
  const { systemPrompt, requestContext, runtimeInstruction } = await buildApplicationPromptParts({
    workspace,
    text,
    activeFile,
    referencedFiles,
    activeSkills,
    selectedAgent,
    executionMemorySummary,
    trailingSections: [
      "Bridge 会自动注入本会话的历史摘要和最近对话；这里的 active_file、user_referenced_files 和 active_skills 只作为应用侧资料上下文。",
    ],
  });

  patchVisibleTraceTurn(traceTurnId, {
    contextEngineId: "bridge-ledger",
    contextWindow,
  });
  appendVisibleTraceStep(traceTurnId, {
    type: "context",
    label: "应用请求上下文准备",
    startedAt: prepareStartedAt,
    endedAt: Date.now(),
    status: "done",
    content: requestContext,
    metadata: {
      sessionRootDir,
      source: "app-request-context",
    },
  });

  const runtimeModelInput = effectiveRuntimeModel
    ? requireRuntimeModelInput(effectiveRuntimeModel)
    : null;
  const requestStartedAt = Date.now();
  appendVisibleTraceStep(traceTurnId, {
    type: "request",
    label: "模型请求",
    status: "done",
    content: systemPrompt,
    metadata: {
      providerName: effectiveRuntimeModel?.provider.name ?? null,
      modelName: effectiveRuntimeModel?.modelName ?? null,
      stream: true,
      source: "bridge-ledger",
    },
    payloads: [
      { label: "runtimeInstruction", content: runtimeInstruction },
      { label: "requestContext", content: requestContext },
      { label: "userMessage", content: text },
    ],
  });

  const streamAccumulator = createMessageStreamAccumulator({
    messageId: assistantMessageId,
    updateMessage,
  });
  let hasLoggedStreamStart = false;
  const response = await runSharedRuntimeChat({
    agentId: runtimeAgentId,
    workspacePath: workspace.path,
    sessionRootDir,
    runtimeModel: runtimeModelInput,
    systemPrompt,
    userMessage: text,
    requestContext,
    runtimeInstruction,
    onTextDelta: (delta) => {
      if (!hasLoggedStreamStart) {
        hasLoggedStreamStart = true;
        appendVisibleTraceStep(traceTurnId, {
          type: "stream",
          label: "开始流式输出",
          status: "done",
          content: delta,
        });
      }
      streamAccumulator.appendTextDelta(delta);
    },
    onThinkingDelta: (delta) => {
      if (!hasLoggedStreamStart) {
        hasLoggedStreamStart = true;
        appendVisibleTraceStep(traceTurnId, {
          type: "stream",
          label: "开始流式输出",
          status: "done",
          content: delta,
        });
      }
      streamAccumulator.appendThinkingDelta(delta);
    },
  });
  streamAccumulator.flushPendingStreamDeltas();

  const assistantText = response.text.trim();
  const thinking = response.thinking?.trim() || undefined;
  if (response.bridgeSession?.userMessageRecordId) {
    updateMessage(userMessageId, (message) => ({
      ...message,
      bridgeMessageRecordId: response.bridgeSession?.userMessageRecordId ?? message.bridgeMessageRecordId,
    }));
  }
  updateMessage(assistantMessageId, (message) => ({
    ...message,
    text: assistantText,
    thinking,
    status: "done",
    bridgeMessageRecordId: response.bridgeSession?.assistantMessageRecordId ?? message.bridgeMessageRecordId,
  }));
  appendVisibleTraceStep(traceTurnId, {
    type: "response",
    label: "模型响应",
    startedAt: requestStartedAt,
    endedAt: Date.now(),
    status: "done",
    content: assistantText,
    metadata: {
      thinkingLength: thinking?.length ?? 0,
      textLength: assistantText.length,
      source: "bridge-ledger",
    },
    payloads: thinking
      ? [{ label: "thinking", content: thinking }]
      : undefined,
  });
  patchVisibleTraceTurn(traceTurnId, {
    status: "done",
  });
  const sessionAfterRun = await readAgentRuntimeSession({
    workspacePath: workspace.path,
    sessionRootDir,
  }).catch(() => null);
  const conversationContext = contextFromSummary(sessionAfterRun?.summary ?? "");
  if (sessionAfterRun?.summary) {
    patchVisibleTraceTurn(traceTurnId, {
      conversationSummary: sessionAfterRun.summary,
    });
  }

  const finalConversation: ConversationMessage[] = [
    ...baseConversation,
    {
      id: userMessageId,
      role: "user",
      content: text,
      timestamp: Date.now(),
      metadata: null,
    },
    {
      id: assistantMessageId,
      role: "assistant",
      content: assistantText,
      timestamp: Date.now(),
      metadata: null,
    },
  ];

  return {
    finalConversation,
    context: conversationContext,
  };
};
