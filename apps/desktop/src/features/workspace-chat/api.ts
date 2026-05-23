import { invoke } from "@tauri-apps/api/core";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type { ChatMessage, ChatSession, ChatSessionMeta, WorkspaceFile, WorkspaceFileEntry } from "./types";
import type { ConversationMessage } from "./types";

export type ChatWithLlmInput = {
  provider: LlmProvider;
  model: ProviderModel;
  systemPrompt: string;
  messages: ConversationMessage[];
};

export type ChatWithLlmOutput = {
  text: string;
  thinking?: string | null;
};

export async function listWorkspaceFiles(workspacePath: string) {
  return invoke<WorkspaceFileEntry[]>("list_workspace_files", {
    input: { workspacePath },
  });
}

export async function readWorkspaceFile(
  workspacePath: string,
  relativePath: string,
) {
  return invoke<WorkspaceFile>("read_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function writeWorkspaceFile(
  workspacePath: string,
  relativePath: string,
  content: string,
) {
  return invoke<WorkspaceFile>("write_workspace_file", {
    input: { workspacePath, relativePath, content },
  });
}

export async function chatWithLlm(input: ChatWithLlmInput) {
  return invoke<ChatWithLlmOutput>("chat_with_llm", { input });
}

export async function listChatSessions(workspacePath: string) {
  return invoke<ChatSessionMeta[]>("list_chat_sessions", {
    input: { workspacePath },
  });
}

export async function loadChatSession(
  workspacePath: string,
  sessionId?: string | null,
) {
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
}) {
  return invoke<ChatSession>("save_chat_session", { input });
}

export async function deleteChatSession(workspacePath: string, sessionId: string) {
  return invoke<ChatSessionMeta[]>("delete_chat_session", {
    input: { workspacePath, sessionId },
  });
}
