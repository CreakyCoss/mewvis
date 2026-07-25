import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentTimestamp } from "@/utils/time";

export type ChatMeta = {
  id: string;
  title: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isUnread?: boolean;
};

export type ChatRecord<TMessage = unknown> = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: TMessage[];
  isUnread?: boolean;
};

export type SaveChatInput<TMessage = unknown> = {
  workspacePath: string;
  chatId?: string | null;
  title?: string | null;
  messages: TMessage[];
  isUnread?: boolean;
};

export async function listChats(workspacePath: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatMeta[]>("list_chats", {
    input: { workspacePath },
  });
}

export async function loadChat<TMessage = unknown>(workspacePath: string, chatId?: string | null) {
  if (!isTauri()) {
    return null;
  }

  return invoke<ChatRecord<TMessage> | null>("load_chat", {
    input: { workspacePath, chatId },
  });
}

export async function saveChat<TMessage = unknown>(input: SaveChatInput<TMessage>) {
  if (!isTauri()) {
    const now = getCurrentTimestamp();
    return {
      id: input.chatId ?? crypto.randomUUID(),
      title: input.title ?? "新的聊天",
      createdAt: now,
      updatedAt: now,
      messages: input.messages,
      isUnread: input.isUnread ?? false,
    } satisfies ChatRecord<TMessage>;
  }

  return invoke<ChatRecord<TMessage>>("save_chat", {
    input: {
      workspacePath: input.workspacePath,
      chatId: input.chatId,
      title: input.title,
      messages: input.messages,
      isUnread: input.isUnread,
    },
  });
}

export async function setChatUnread(input: { workspacePath: string; chatId: string; isUnread: boolean }) {
  if (!isTauri()) {
    return null;
  }

  return invoke<ChatMeta>("set_chat_unread", { input });
}

export async function deleteChat(workspacePath: string, chatId: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatMeta[]>("delete_chat", {
    input: { workspacePath, chatId },
  });
}
