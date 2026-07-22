import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ChatMessage as LegacyChatMessage, ChatSession, ChatSessionMeta } from "@/features/pages/chat/types";
import { getCurrentTimestamp } from "@/utils/time";

type ChatSessionData<TMessage> = Omit<ChatSession, "messages"> & {
  messages: TMessage[];
};

export async function listChatSessions(workspacePath: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatSessionMeta[]>("list_chat_sessions", {
    input: { workspacePath },
  });
}

export async function loadChatSession<TMessage = LegacyChatMessage>(workspacePath: string, sessionId?: string | null) {
  if (!isTauri()) {
    return null;
  }

  return invoke<ChatSessionData<TMessage> | null>("load_chat_session", {
    input: { workspacePath, sessionId },
  });
}

export async function saveChatSession<TMessage = LegacyChatMessage>(input: {
  workspacePath: string;
  sessionId?: string | null;
  title?: string | null;
  messages: TMessage[];
  isUnread?: boolean;
}) {
  if (!isTauri()) {
    const now = getCurrentTimestamp();
    return {
      id: input.sessionId ?? crypto.randomUUID(),
      title: input.title ?? "新的聊天",
      createdAt: now,
      updatedAt: now,
      messages: input.messages,
      isUnread: input.isUnread ?? false,
    } satisfies ChatSessionData<TMessage>;
  }

  return invoke<ChatSessionData<TMessage>>("save_chat_session", {
    input: {
      workspacePath: input.workspacePath,
      sessionId: input.sessionId,
      title: input.title,
      messages: input.messages,
      isUnread: input.isUnread,
    },
  });
}

export async function setChatSessionUnread(input: { workspacePath: string; sessionId: string; isUnread: boolean }) {
  if (!isTauri()) {
    return null;
  }

  return invoke<ChatSessionMeta>("set_chat_session_unread", { input });
}

export async function deleteChatSession(workspacePath: string, sessionId: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatSessionMeta[]>("delete_chat_session", {
    input: { workspacePath, sessionId },
  });
}
