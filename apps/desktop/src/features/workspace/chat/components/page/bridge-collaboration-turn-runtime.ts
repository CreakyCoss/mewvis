import type { Workspace } from "@/features/workspace/types";
import {
  appendAgentRuntimeSessionMessages,
  readAgentRuntimeSession,
} from "../../api";
import type {
  ChatContextSummary,
  ConversationMessage,
  PromptContextLimits,
} from "../../types";
import type {
  ChatMode,
  ContextDebugSnapshot,
} from "../../page-types";
import { createBridgeSessionRootDir } from "../../utils/sessions";
import type {
  AppendVisibleTraceStep,
  FinalizeAssistantTurn,
  PatchVisibleTraceTurn,
  ReportContextDebugUpdate,
  UpdateMessage,
} from "./modes/types";
import { buildApplicationPromptParts } from "./application-system-prompt";

type BridgeCollaborationTurnRuntimeInput = {
  workspace: Workspace;
  chatMode: ChatMode;
  runtimeAgentId: string;
  traceProviderName: string | null;
  traceModelName: string | null;
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
  nextConversation: ConversationMessage[];
  executionMemorySummary: string;
  contextWindow: number;
  modelContext: {
    contextWindow?: number;
    maxTokens?: number;
  };
  onDebugSnapshot(snapshot: ContextDebugSnapshot): void;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
  updateMessage: UpdateMessage;
  onFinalized(input: {
    finalConversation: ConversationMessage[];
    finalContext: ChatContextSummary | null;
  }): void;
};

export type BridgeCollaborationTurnRuntimeResult = {
  runtimeMessages: ConversationMessage[];
  summaryLimits: PromptContextLimits;
  conversationSummary: string;
  sessionRootDir: string;
  baseSystemPrompt: string;
  baseRequestContext: string;
  baseRuntimeInstruction: string;
  reportContextDebugUpdate: ReportContextDebugUpdate;
  finalizeAssistantTurn: FinalizeAssistantTurn;
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

const DEFAULT_CONTEXT_WINDOW = 200000;
const BASE_CONTEXT_WINDOW = 64000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const promptLimitsFromModel = (
  model?: BridgeCollaborationTurnRuntimeInput["modelContext"] | null,
): PromptContextLimits => {
  const contextWindow = model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const maxTokens = model?.maxTokens ?? 4096;
  const reserveTokens = Math.min(
    Math.max(maxTokens + 2048, 4096),
    Math.max(4096, Math.floor(contextWindow * 0.45)),
  );
  const usableTokens = Math.max(4096, contextWindow - reserveTokens);
  const scale = clamp(usableTokens / BASE_CONTEXT_WINDOW, 0.25, 4);

  return {
    activeFileChars: Math.floor(12000 * scale),
    referenceFileChars: Math.floor(20000 * scale),
    totalReferenceChars: Math.floor(50000 * scale),
    skillChars: Math.floor(12000 * scale),
    totalSkillChars: Math.floor(36000 * scale),
    summaryChars: Math.floor(12000 * scale),
    recentHistoryChars: Math.floor(24000 * scale),
    recentHistoryTokens: Math.max(1, Math.floor(Math.floor(24000 * scale) / 4)),
  };
};

const toRuntimeMessages = ({
  messages,
  currentUserText,
  limits,
}: {
  messages: ConversationMessage[];
  currentUserText: string;
  limits: PromptContextLimits;
}): ConversationMessage[] => {
  const previousMessages = messages.filter((message, index) =>
    !(index === messages.length - 1 &&
      message.role === "user" &&
      message.content.trim() === currentUserText.trim())
  );
  const selected: ConversationMessage[] = [];
  let remaining = limits.recentHistoryChars;

  for (const message of previousMessages.slice().reverse()) {
    if (remaining <= 0) {
      break;
    }
    const content = message.content.length <= remaining
      ? message.content
      : `${message.content.slice(0, Math.max(0, remaining))}\n\n[内容已按上下文预算截断]`;
    selected.unshift({
      ...message,
      content,
    });
    remaining -= content.length + 24;
  }

  return selected;
};

export const prepareBridgeCollaborationTurnRuntime = async ({
  workspace,
  chatMode,
  runtimeAgentId,
  traceProviderName,
  traceModelName,
  nextSessionId,
  userMessageId,
  assistantMessageId,
  traceTurnId,
  text,
  referencedFiles,
  activeFile,
  activeSkills,
  nextConversation,
  executionMemorySummary,
  contextWindow,
  modelContext,
  onDebugSnapshot,
  appendVisibleTraceStep,
  patchVisibleTraceTurn,
  updateMessage,
  onFinalized,
}: BridgeCollaborationTurnRuntimeInput): Promise<BridgeCollaborationTurnRuntimeResult> => {
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
    executionMemorySummary,
    trailingSections: [
      "Bridge 会自动注入本会话的历史摘要和最近对话；这里的 active_file、user_referenced_files 和 active_skills 只作为应用侧资料上下文。",
    ],
  });

  const summaryLimits = promptLimitsFromModel(modelContext);
  const runtimeMessages = toRuntimeMessages({
    messages: nextConversation,
    currentUserText: text,
    limits: summaryLimits,
  });
  const basePayloads = [{
    label: "systemPrompt",
    content: systemPrompt,
  }, {
    label: "runtimeInstruction",
    content: runtimeInstruction,
  }, {
    label: "requestContext",
    content: requestContext,
  }];
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
    providerName: traceProviderName,
    modelName: traceModelName,
    activeFilePath: activeFile?.path ?? null,
    referencedFilePaths: referencedFiles.map((file) => file.path),
    activeSkillNames: activeSkills.map((skill) => skill.name),
    selectedAgentId: null,
    selectedAgentName: null,
    conversationSummary: "",
    runtimeMessages,
    knowledgeMatches: [],
    systemPrompt,
    payloads,
    ...overrides,
  });

  patchVisibleTraceTurn(traceTurnId, {
    contextEngineId: "bridge-ledger",
    contextWindow,
    conversationSummary: "",
  });

  const appendUserStartedAt = Date.now();
  const initialAppend = await appendAgentRuntimeSessionMessages({
    workspacePath: workspace.path,
    sessionRootDir,
    messages: [
      {
        role: "system",
        content: systemPrompt,
        timestamp: Date.now(),
        metadata: {
          runtime: "collab",
        },
      },
      {
        role: "user",
        content: text,
        timestamp: Date.now(),
        metadata: {
          uiMessageId: userMessageId,
          runtime: "collab",
        },
      },
    ],
  });
  updateMessage(userMessageId, (message) => ({
    ...message,
    bridgeMessageRecordId: initialAppend?.messageRecordIds?.at(-1) ?? message.bridgeMessageRecordId,
  }));
  appendVisibleTraceStep(traceTurnId, {
    type: "context",
    label: "Bridge 协作用户消息写入",
    startedAt: appendUserStartedAt,
    endedAt: Date.now(),
    status: "done",
    content: text,
    metadata: {
      sessionRootDir,
      messageRecordIds: initialAppend?.messageRecordIds ?? [],
      source: "bridge-ledger",
    },
  });
  appendVisibleTraceStep(traceTurnId, {
    type: "context",
    label: "应用协作请求上下文准备",
    startedAt: prepareStartedAt,
    endedAt: Date.now(),
    status: "done",
    content: requestContext,
    metadata: {
      sessionRootDir,
      runtimeMessageCount: runtimeMessages.length,
      source: "app-request-context",
    },
    payloads: basePayloads,
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

  const finalizeAssistantTurn: FinalizeAssistantTurn = async ({
    assistantText,
    assistantMessages,
  }) => {
    const finalizedAssistantMessages = assistantMessages && assistantMessages.length > 0
      ? assistantMessages
      : [{
        id: assistantMessageId,
        role: "assistant" as const,
        content: assistantText,
        timestamp: Date.now(),
        metadata: null,
      }];
    const finalConversation = [
      ...nextConversation,
      ...finalizedAssistantMessages,
    ];
    const readStartedAt = Date.now();
    const result = await readAgentRuntimeSession({
      workspacePath: workspace.path,
      sessionRootDir,
    });
    const finalContext = contextFromSummary(result?.summary ?? "");
    appendVisibleTraceStep(traceTurnId, {
      type: "context",
      label: "Bridge 协作上下文回读",
      startedAt: readStartedAt,
      endedAt: Date.now(),
      status: "done",
      content: result?.summary || "（空）",
      metadata: {
        sessionRootDir,
        source: "bridge-ledger",
      },
    });
    patchVisibleTraceTurn(traceTurnId, {
      status: "done",
      conversationSummary: result?.summary ?? "",
    });
    onFinalized({
      finalConversation,
      finalContext,
    });
  };

  return {
    runtimeMessages,
    summaryLimits,
    conversationSummary: "",
    sessionRootDir,
    baseSystemPrompt: systemPrompt,
    baseRequestContext: requestContext,
    baseRuntimeInstruction: runtimeInstruction,
    reportContextDebugUpdate,
    finalizeAssistantTurn,
  };
};
