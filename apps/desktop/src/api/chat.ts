import { invoke } from "@/transport";

export type ChatOrigin =
  { kind: "builtin"; sceneId: string } | { kind: "application"; applicationId: string; sceneId: string };
export type ChatMeta = {
  id: string;
  title: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isUnread?: boolean;
  workspaceId?: string;
  origin?: ChatOrigin;
};

export type ChatRecord<TMessage = unknown, TOptions = unknown> = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspaceId?: string;
  origin?: ChatOrigin;
  messages: TMessage[];
  options?: TOptions | null;
  isUnread?: boolean;
};

export type SaveChatInput<TMessage = unknown, TOptions = unknown> = {
  workspacePath: string;
  workspaceId: string;
  origin: ChatOrigin;
  chatId?: string | null;
  title?: string | null;
  messages: TMessage[];
  options?: TOptions | null;
  isUnread?: boolean;
};

export async function listChats(workspacePath: string) {
  return invoke<ChatMeta[]>("list_chats", {
    input: { workspacePath },
  });
}

export async function loadChat<TMessage = unknown, TOptions = unknown>(workspacePath: string, chatId?: string | null) {
  return invoke<ChatRecord<TMessage, TOptions> | null>("load_chat", {
    input: { workspacePath, chatId },
  });
}

export async function saveChat<TMessage = unknown, TOptions = unknown>(input: SaveChatInput<TMessage, TOptions>) {
  return invoke<ChatRecord<TMessage, TOptions>>("save_chat", {
    input: {
      workspacePath: input.workspacePath,
      chatId: input.chatId,
      title: input.title,
      workspaceId: input.workspaceId,
      origin: input.origin,
      messages: input.messages,
      options: input.options,
      isUnread: input.isUnread,
    },
  });
}

export async function setChatUnread(input: { workspacePath: string; chatId: string; isUnread: boolean }) {
  return invoke<ChatMeta>("set_chat_unread", { input });
}

export async function deleteChat(workspacePath: string, chatId: string) {
  return invoke<ChatMeta[]>("delete_chat", {
    input: { workspacePath, chatId },
  });
}
