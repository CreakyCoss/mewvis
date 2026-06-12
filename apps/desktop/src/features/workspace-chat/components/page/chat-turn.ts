import type {
  AgentProfile,
  CollaborationWorkflowProfile,
} from "@/features/agent-settings/types";
import type { RuntimeModelOption } from "@/features/llm-settings/runtime-models";
import type {
  ChatExecutionMode,
  ChatMode,
  FileReferenceMatch,
  ModelSource,
  ResolvedFileReference,
} from "../../page-types";
import type {
  ChatContextSummary,
  ChatMessage,
  ChatTraceTurn,
  ConversationMessage,
} from "../../types";
import { isAgentTaskMode } from "../../utils/chat-mode";
import { createChatTraceStep } from "./trace";

type ValidateComposerSubmitInput = {
  chatMode: ChatMode;
  selectedCollaborationWorkflow: CollaborationWorkflowProfile | null;
  runtimeAgentRequiresModel: boolean;
  effectiveRuntimeModel: RuntimeModelOption | null;
  unresolvedFileReferences: FileReferenceMatch[];
  ambiguousFileReferences: FileReferenceMatch[];
};

type ValidComposerSubmit = {
  ok: true;
  collaborationWorkflow: CollaborationWorkflowProfile | null;
  collaborationWriterAgent: AgentProfile | null;
  collaborationReviewerAgent: AgentProfile | null;
};

type InvalidComposerSubmit = {
  ok: false;
  error: string;
};

export const validateComposerSubmit = ({
  chatMode,
  selectedCollaborationWorkflow,
  runtimeAgentRequiresModel,
  effectiveRuntimeModel,
  unresolvedFileReferences,
  ambiguousFileReferences,
}: ValidateComposerSubmitInput): ValidComposerSubmit | InvalidComposerSubmit => {
  const collaborationWorkflow = chatMode === "collab" ? selectedCollaborationWorkflow : null;
  const collaborationWriterAgent = collaborationWorkflow?.writerAgent ?? null;
  const collaborationReviewerAgent = collaborationWorkflow?.reviewerAgent ?? null;

  if (chatMode === "collab" && (!collaborationWorkflow || !collaborationWriterAgent || !collaborationReviewerAgent)) {
    return { ok: false, error: "请选择协作流程" };
  }

  if (chatMode !== "collab" && runtimeAgentRequiresModel && !effectiveRuntimeModel) {
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
    collaborationWorkflow,
    collaborationWriterAgent,
    collaborationReviewerAgent,
  };
};

type CreateChatTurnDraftInput = {
  now: number;
  text: string;
  chatMode: ChatMode;
  chatExecutionMode: ChatExecutionMode;
  modelSource: ModelSource;
  referencedFiles: ResolvedFileReference[];
  baseConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  activeFilePath: string | null;
  assistantAgentAvatar?: string;
  assistantAgentName?: string;
  providerName: string | null;
  modelName: string | null;
  runtimeAgentId: string;
  contextEngineId: string;
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
  chatMode,
  chatExecutionMode,
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
  contextEngineId,
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
  const isAgentBackedTurn = isAgentTaskMode(chatMode, chatExecutionMode);
  const assistantUiMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    mode: chatMode,
    text: "",
    status: "loading",
    createdAt: now,
    agentAvatar: assistantAgentAvatar,
    agentName: assistantAgentName,
    agentEvents: isAgentBackedTurn ? [] : undefined,
    agentBlocks: isAgentBackedTurn ? [] : undefined,
  };
  const traceTurnId = `${now}-${assistantMessageId}`;
  const traceTurn: ChatTraceTurn = {
    id: traceTurnId,
    mode: chatMode,
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
    contextEngineId,
    contextWindow,
    conversationSummary: baseConversationContext?.summary ?? "",
    steps: [
      createChatTraceStep({
        type: "input",
        label: "用户输入",
        status: "done",
        content: text,
        metadata: {
          mode: chatMode,
          chatExecutionMode,
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
