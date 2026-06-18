import type { RuntimeModelOption } from "@/features/ai/components/llm-setting/store";
import type {
  FileReferenceMatch,
  ModelSource,
} from "../../page-types";
import type {
  ChatContextSummary,
  ChatMessage,
  ChatTraceTurn,
  ConversationMessage,
} from "../../types";
import { createChatTraceStep } from "./trace";

type ValidateComposerSubmitInput = {
  runtimeAgentRequiresModel: boolean;
  effectiveRuntimeModel: RuntimeModelOption | null;
  unresolvedFileReferences: FileReferenceMatch[];
  ambiguousFileReferences: FileReferenceMatch[];
};

type ValidComposerSubmit = {
  ok: true;
};

type InvalidComposerSubmit = {
  ok: false;
  error: string;
};

export const validateComposerSubmit = ({
  runtimeAgentRequiresModel,
  effectiveRuntimeModel,
  unresolvedFileReferences,
  ambiguousFileReferences,
}: ValidateComposerSubmitInput): ValidComposerSubmit | InvalidComposerSubmit => {
  if (runtimeAgentRequiresModel && !effectiveRuntimeModel) {
    return { ok: false, error: "请选择要使用的 LLM 和模型" };
  }

  if (unresolvedFileReferences.length > 0) {
    return {
      ok: false,
      error: `未找到引用文件：${unresolvedFileReferences.map((match) => `@${match.token}`).join("、")}`,
    };
  }

  if (ambiguousFileReferences.length > 0) {
    return {
      ok: false,
      error: ambiguousFileReferences
        .map((match) => {
          const candidates = match.matches.slice(0, 5).map((file) => file.path).join("、");
          return `@${match.token} 匹配到多个文件：${candidates}`;
        })
        .join("\n"),
    };
  }

  return {
    ok: true,
  };
};

type CreateChatTurnDraftInput = {
  now: number;
  text: string;
  modelSource: ModelSource;
  referencedFiles: Array<{ path: string }>;
  baseConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  activeFilePath: string | null;
  assistantAgentAvatar?: string;
  assistantAgentName?: string;
  providerName: string | null;
  modelName: string | null;
  runtimeAgentId: string;
  contextWindow: number;
  userMessageId: string;
  assistantMessageId: string;
};

export type ChatTurnDraft = {
  userMessage: ConversationMessage;
  nextConversation: ConversationMessage[];
  userUiMessage: ChatMessage;
  assistantUiMessage: ChatMessage;
  traceTurnId: string;
  traceTurn: ChatTraceTurn;
  referencedFilePaths: string[];
};

export const createChatTurnDraft = ({
  now,
  text,
  modelSource,
  referencedFiles,
  baseConversation,
  baseConversationContext,
  activeFilePath,
  assistantAgentAvatar,
  assistantAgentName,
  providerName,
  modelName,
  runtimeAgentId,
  contextWindow,
  userMessageId,
  assistantMessageId,
}: CreateChatTurnDraftInput): ChatTurnDraft => {
  const referencedFilePaths = referencedFiles.map((file) => file.path);
  const userMessage: ConversationMessage = {
    id: userMessageId,
    role: "user",
    content: text,
    timestamp: now,
  };
  const nextConversation = [...baseConversation, userMessage];
  const userUiMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    text,
    createdAt: now,
    referencedFiles: referencedFilePaths.map((path) => ({ path })),
  };
  const assistantUiMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    mode: "agent",
    text: "",
    status: "loading",
    createdAt: now,
    agentAvatar: assistantAgentAvatar,
    agentName: assistantAgentName,
    agentEvents: [],
    agentBlocks: [],
  };
  const traceTurnId = `${now}-${assistantMessageId}`;
  const traceTurn: ChatTraceTurn = {
    id: traceTurnId,
    mode: "agent",
    status: "running",
    createdAt: now,
    updatedAt: now,
    userMessageId,
    assistantMessageId,
    userText: text,
    referencedFilePaths,
    activeFilePath,
    providerName,
    modelName,
    runtimeAgentId,
    agentSessionId: null,
    contextEngineId: "bridge-ledger",
    contextWindow,
    conversationSummary: baseConversationContext?.summary ?? "",
    steps: [
      createChatTraceStep({
        type: "input",
        label: "用户输入",
        status: "done",
        content: text,
        metadata: {
          mode: "agent",
          modelSource,
          referencedFilePaths,
          activeFilePath,
        },
      }),
    ],
  };

  return {
    userMessage,
    nextConversation,
    userUiMessage,
    assistantUiMessage,
    traceTurnId,
    traceTurn,
    referencedFilePaths,
  };
};
