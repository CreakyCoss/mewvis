import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type {
  ChatMessage,
  FileReferenceMatch,
} from "../../types";

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
  referencedFiles: Array<{ path: string }>;
  assistantAgentAvatar?: string;
  assistantAgentName?: string;
  userMessageId: string;
  assistantMessageId: string;
};

export type ChatTurnDraft = {
  userUiMessage: ChatMessage;
  assistantUiMessage: ChatMessage;
  referencedFilePaths: string[];
};

export const createChatTurnDraft = ({
  now,
  text,
  referencedFiles,
  assistantAgentAvatar,
  assistantAgentName,
  userMessageId,
  assistantMessageId,
}: CreateChatTurnDraftInput): ChatTurnDraft => {
  const referencedFilePaths = referencedFiles.map((file) => file.path);
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

  return {
    userUiMessage,
    assistantUiMessage,
    referencedFilePaths,
  };
};
