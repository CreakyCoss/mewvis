import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  toAgentRuntimeModelConfig,
  toAgentRuntimeProviderConfig,
} from "@/agent-runtime/config";
import { createAgentRuntime } from "@/agent-runtime/runtime";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type {
  AgentSessionStatus,
  ChatContextSummary,
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
  CleanupAgentSessionsResult,
  WorkspaceFile,
  WorkspaceFileEntry,
} from "./types";
import type { ConversationMessage } from "./types";

const agentRuntime = createAgentRuntime();

export type RunAgentRuntimeChatInput = {
  agentId?: string;
  provider?: LlmProvider | null;
  model?: ProviderModel | null;
  systemPrompt: string;
  messages: ConversationMessage[];
  contextWindow?: number;
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type RunAgentRuntimeChatOutput = {
  text: string;
  thinking?: string | null;
};

export async function listWorkspaceFiles(workspacePath: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<WorkspaceFileEntry[]>("list_workspace_files", {
    input: { workspacePath },
  });
}

export async function readWorkspaceFile(
  workspacePath: string,
  relativePath: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持读取工作区文件");
  }

  return invoke<WorkspaceFile>("read_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function writeWorkspaceFile(
  workspacePath: string,
  relativePath: string,
  content: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持保存工作区文件");
  }

  return invoke<WorkspaceFile>("write_workspace_file", {
    input: { workspacePath, relativePath, content },
  });
}

export async function runAgentRuntimeChat(
  input: RunAgentRuntimeChatInput,
): Promise<RunAgentRuntimeChatOutput> {
  return agentRuntime.run({
    type: "chat",
    agentId: input.agentId,
    provider: input.provider ? toAgentRuntimeProviderConfig(input.provider) : undefined,
    model: input.provider && input.model
      ? {
        ...toAgentRuntimeModelConfig(input.provider, input.model),
        ...(input.contextWindow ? { contextWindow: input.contextWindow } : {}),
      }
      : undefined,
    systemPrompt: input.systemPrompt,
    messages: input.messages,
    stream: input.stream ?? true,
    onTextDelta: input.onTextDelta,
    onThinkingDelta: input.onThinkingDelta,
  });
}

export async function listChatSessions(workspacePath: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatSessionMeta[]>("list_chat_sessions", {
    input: { workspacePath },
  });
}

export async function loadChatSession(
  workspacePath: string,
  sessionId?: string | null,
) {
  if (!isTauri()) {
    return null;
  }

  return invoke<ChatSession | null>("load_chat_session", {
    input: { workspacePath, sessionId },
  });
}

export async function saveChatSession(input: {
  workspacePath: string;
  sessionId?: string | null;
  title?: string | null;
  messages: ChatMessage[];
  conversation: ConversationMessage[];
  context?: ChatContextSummary | null;
}) {
  if (!isTauri()) {
    const now = Date.now();
    return {
      id: input.sessionId ?? crypto.randomUUID(),
      title: input.title ?? "新的聊天",
      createdAt: now,
      updatedAt: now,
      messages: input.messages,
      conversation: input.conversation,
      context: input.context,
    } satisfies ChatSession;
  }

  return invoke<ChatSession>("save_chat_session", { input });
}

export async function deleteChatSession(workspacePath: string, sessionId: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatSessionMeta[]>("delete_chat_session", {
    input: { workspacePath, sessionId },
  });
}

export async function getAgentSessionStatus(
  workspacePath: string,
  sessionId?: string | null,
) {
  if (!isTauri()) {
    return {
      exists: false,
      sessionDir: "",
      latestSessionFile: null,
      sessionFileCount: 0,
      totalBytes: 0,
      messageCount: 0,
      toolCallCount: 0,
      activeMessageCount: 0,
      activeToolCallCount: 0,
      estimatedContextTokens: 0,
      compactionCount: 0,
      latestCompaction: null,
    } satisfies AgentSessionStatus;
  }

  return invoke<AgentSessionStatus>("get_agent_session_status", {
    input: { workspacePath, sessionId },
  });
}

export async function cleanupOrphanAgentSessions(
  workspacePath: string,
  protectedSessionId?: string | null,
) {
  if (!isTauri()) {
    return {
      removedCount: 0,
      removedBytes: 0,
    } satisfies CleanupAgentSessionsResult;
  }

  return invoke<CleanupAgentSessionsResult>("cleanup_orphan_agent_sessions", {
    input: { workspacePath, protectedSessionId },
  });
}

export async function resetAgentSessionsForChat(workspacePath: string, chatSessionId: string) {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<void>("reset_agent_sessions_for_chat", {
    input: { workspacePath, chatSessionId },
  });
}
