import { create } from "zustand";
import { deleteChat as deleteChatApi, listChats, type ChatMeta, type ChatRecord } from "@/api/chat";
import {
  createWorkspace as createWorkspaceApi,
  deleteWorkspace as deleteWorkspaceApi,
  listWorkspaces,
  updateWorkspace as updateWorkspaceApi,
  type Workspace,
} from "@/api/workspace";
import { chatService } from "@/workbench/shell/chat-service";

type CurrentChat = {
  workspaceId: string;
  chatId: string;
};

export type OpenChat = CurrentChat;

export type ChatActivity = "running" | "pausing" | "paused" | "cancelling" | "waiting-approval" | "waiting-answer";

type ChatActivityMap = Partial<Record<string, Partial<Record<string, ChatActivity>>>>;

const MAX_OPEN_CHAT_COUNT = 5;

type WorkspaceStore = {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentChat: CurrentChat | null;
  openChats: OpenChat[];
  chatsByWorkspaceId: Record<string, ChatMeta[]>;
  chatActivityMap: ChatActivityMap;
  isLoading: boolean;
  error: string;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setCurrentChat: (chat: CurrentChat | null) => void;
  openChat: (chat: OpenChat) => void;
  acceptChatRecord: (workspacePath: string, record: ChatRecord) => void;
  setChatActivity: (workspaceId: string, chatId: string, activity: ChatActivity | null) => void;
  deleteChat: (workspace: Workspace, chatId: string) => Promise<void>;
  loadWorkspaces: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (input: { name: string; description: string; path: string }) => Promise<void>;
  updateWorkspace: (workspaceId: string, input: { name: string; description: string }) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : fallback;
};

const sortWorkspaces = (workspaces: Workspace[]) =>
  [...workspaces].sort(
    (left, right) =>
      Number(right.isPinned) - Number(left.isPinned) ||
      left.order - right.order ||
      left.name.localeCompare(right.name, "zh-CN"),
  );

const sortChats = (chats: ChatMeta[]) =>
  [...chats].sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));

const chatToMeta = (chat: ChatRecord, previous?: ChatMeta): ChatMeta => ({
  id: chat.id,
  workspaceId: chat.workspaceId,
  origin: chat.origin,
  title: chat.title,
  path: previous?.path ?? "",
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
  messageCount: chat.messages.length,
  isUnread: chat.isUnread ?? previous?.isUnread ?? false,
});

const mergeChatMeta = (chats: ChatMeta[], chat: ChatMeta) => {
  const previous = chats.find((item) => item.id === chat.id);
  const nextChat = {
    ...previous,
    ...chat,
    createdAt: previous?.createdAt ?? chat.createdAt,
  };

  return sortChats([nextChat, ...chats.filter((item) => item.id !== chat.id)]);
};

const updateChatUnread = (chats: ChatMeta[], chatId: string, isUnread: boolean) =>
  chats.map((chat) => (chat.id === chatId ? { ...chat, isUnread } : chat));

const isSameChat = (left: CurrentChat | null, right: CurrentChat) =>
  left?.workspaceId === right.workspaceId && left.chatId === right.chatId;

const updateChatActivity = (
  chatActivityMap: ChatActivityMap,
  workspaceId: string,
  chatId: string,
  activity: ChatActivity | null,
) => {
  const nextMap = { ...chatActivityMap };
  const workspaceChatActivityMap = { ...nextMap[workspaceId] };

  if (activity) {
    workspaceChatActivityMap[chatId] = activity;
  } else {
    delete workspaceChatActivityMap[chatId];
  }

  if (Object.keys(workspaceChatActivityMap).length > 0) {
    nextMap[workspaceId] = workspaceChatActivityMap;
  } else {
    delete nextMap[workspaceId];
  }

  return nextMap;
};

const keepCurrentChatRead = (chatsByWorkspaceId: Record<string, ChatMeta[]>, currentChat: CurrentChat | null) => {
  if (!currentChat) {
    return chatsByWorkspaceId;
  }

  return {
    ...chatsByWorkspaceId,
    [currentChat.workspaceId]: updateChatUnread(
      chatsByWorkspaceId[currentChat.workspaceId] ?? [],
      currentChat.chatId,
      false,
    ),
  };
};

const resolveCurrentWorkspace = (workspaces: Workspace[], currentWorkspace: Workspace | null) =>
  workspaces.find((workspace) => workspace.id === currentWorkspace?.id) ??
  workspaces.find((workspace) => workspace.isDefault) ??
  null;

const fetchWorkspaces = async (currentWorkspace: Workspace | null, previousWorkspaceIds?: ReadonlySet<string>) => {
  const overview = await listWorkspaces();
  const workspaces = sortWorkspaces(
    overview.map((workspace) => (workspace.isDefault ? { ...workspace, name: "默认工作区" } : workspace)),
  );
  const createdWorkspace = previousWorkspaceIds
    ? workspaces
        .filter((workspace) => !workspace.isDefault && !previousWorkspaceIds.has(workspace.id))
        .sort((left, right) => right.createdAt - left.createdAt)[0]
    : null;
  const nextWorkspace = createdWorkspace ?? resolveCurrentWorkspace(workspaces, currentWorkspace);
  const chatsByWorkspaceId = Object.fromEntries(
    await Promise.all(workspaces.map(async (workspace) => [workspace.id, await listChats(workspace.path)] as const)),
  );

  return {
    workspaces,
    currentWorkspace: nextWorkspace,
    chatsByWorkspaceId,
  };
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  currentChat: null,
  openChats: [],
  chatsByWorkspaceId: {},
  chatActivityMap: {},
  isLoading: false,
  error: "",
  setCurrentWorkspace: (workspace) => {
    set({
      currentWorkspace: workspace,
      error: "",
    });
  },
  setCurrentChat: (chat) => {
    if (!chat) {
      set({ currentChat: null });
      return;
    }

    const workspace =
      get().workspaces.find((item) => item.id === chat.workspaceId) ??
      (get().currentWorkspace?.id === chat.workspaceId ? get().currentWorkspace : null);

    set((state) => ({
      currentChat: chat,
      chatsByWorkspaceId: {
        ...state.chatsByWorkspaceId,
        [chat.workspaceId]: updateChatUnread(state.chatsByWorkspaceId[chat.workspaceId] ?? [], chat.chatId, false),
      },
    }));

    if (workspace) {
      void chatService.setUnread(workspace.path, chat.chatId, false).catch((error) => {
        set({
          error: getErrorMessage(error, "对话已读状态更新失败，请重试。"),
        });
      });
    }
  },
  openChat: (chat) => {
    set((state) => {
      const existingChatIndex = state.openChats.findIndex((item) => isSameChat(item, chat));
      if (existingChatIndex >= 0) return state;

      if (state.openChats.length < MAX_OPEN_CHAT_COUNT) {
        return { openChats: [...state.openChats, chat] };
      }

      const removableChatIndex = state.openChats.findIndex(
        (item) => !isSameChat(state.currentChat, item) && !state.chatActivityMap[item.workspaceId]?.[item.chatId],
      );

      return {
        openChats:
          removableChatIndex >= 0
            ? [...state.openChats.filter((_, index) => index !== removableChatIndex), chat]
            : [...state.openChats, chat],
      };
    });
    if (!isSameChat(get().currentChat, chat)) {
      get().setCurrentChat(chat);
    }
  },
  acceptChatRecord: (workspacePath, record) => {
    const workspace = get().workspaces.find((item) => item.path === workspacePath);
    if (!workspace) return;
    set((state) => ({
      chatsByWorkspaceId: {
        ...state.chatsByWorkspaceId,
        [workspace.id]: mergeChatMeta(
          state.chatsByWorkspaceId[workspace.id] ?? [],
          chatToMeta(
            record,
            state.chatsByWorkspaceId[workspace.id]?.find((item) => item.id === record.id),
          ),
        ),
      },
    }));
  },
  setChatActivity: (workspaceId, chatId, activity) => {
    const previousActivity = get().chatActivityMap[workspaceId]?.[chatId] ?? null;
    if (previousActivity === activity) return;
    const shouldMarkUnread =
      previousActivity !== null &&
      activity === null &&
      (get().currentChat?.chatId !== chatId || get().currentChat?.workspaceId !== workspaceId);
    const workspace =
      get().workspaces.find((item) => item.id === workspaceId) ??
      (get().currentWorkspace?.id === workspaceId ? get().currentWorkspace : null);

    set((state) => {
      const chatActivityMap = updateChatActivity(state.chatActivityMap, workspaceId, chatId, activity);

      return {
        chatActivityMap,
        chatsByWorkspaceId: shouldMarkUnread
          ? {
              ...state.chatsByWorkspaceId,
              [workspaceId]: updateChatUnread(state.chatsByWorkspaceId[workspaceId] ?? [], chatId, true),
            }
          : state.chatsByWorkspaceId,
      };
    });

    if (shouldMarkUnread) {
      if (!workspace) {
        return;
      }

      void chatService.setUnread(workspace.path, chatId, true).catch((error) => {
        set({
          error: getErrorMessage(error, "对话未读状态更新失败，请重试。"),
        });
      });
    }
  },
  deleteChat: async (workspace, chatId) => {
    const closed = await chatService.closeRecord(workspace.path, chatId);
    if (!closed.ok) {
      set({ error: closed.error });
      return;
    }
    const previousChats = get().chatsByWorkspaceId[workspace.id] ?? [];
    const deletedChat = previousChats.find((chat) => chat.id === chatId);
    const previousActivity = get().chatActivityMap[workspace.id]?.[chatId];
    set((state) => ({
      chatsByWorkspaceId: {
        ...state.chatsByWorkspaceId,
        [workspace.id]: previousChats.filter((chat) => chat.id !== chatId),
      },
      chatActivityMap: updateChatActivity(state.chatActivityMap, workspace.id, chatId, null),
      openChats: state.openChats.filter((chat) => chat.workspaceId !== workspace.id || chat.chatId !== chatId),
      currentChat:
        state.currentChat?.chatId === chatId && state.currentChat.workspaceId === workspace.id
          ? null
          : state.currentChat,
      error: "",
    }));

    try {
      await deleteChatApi(workspace.path, chatId);
    } catch (error) {
      set((state) => ({
        chatsByWorkspaceId: {
          ...state.chatsByWorkspaceId,
          [workspace.id]: deletedChat
            ? mergeChatMeta(state.chatsByWorkspaceId[workspace.id] ?? [], deletedChat)
            : (state.chatsByWorkspaceId[workspace.id] ?? []),
        },
        chatActivityMap: previousActivity
          ? updateChatActivity(state.chatActivityMap, workspace.id, chatId, previousActivity)
          : state.chatActivityMap,
        error: getErrorMessage(error, "对话删除失败，请重试。"),
      }));
    }
  },
  loadWorkspaces: async () => {
    if (get().isLoading) {
      return;
    }

    set({ isLoading: true, error: "" });

    try {
      const result = await fetchWorkspaces(get().currentWorkspace);

      set({
        ...result,
        chatsByWorkspaceId: keepCurrentChatRead(result.chatsByWorkspaceId, get().currentChat),
        isLoading: false,
      });
    } catch (error) {
      set({
        workspaces: [],
        currentWorkspace: null,
        currentChat: null,
        openChats: [],
        chatsByWorkspaceId: {},
        isLoading: false,
        error: getErrorMessage(error, "工作区列表加载失败，请重试。"),
      });
    }
  },
  refreshWorkspaces: async () => {
    const previousWorkspaceIds = new Set(get().workspaces.map((workspace) => workspace.id));
    set({ isLoading: true, error: "" });

    try {
      const result = await fetchWorkspaces(get().currentWorkspace, previousWorkspaceIds);

      set({
        ...result,
        chatsByWorkspaceId: keepCurrentChatRead(result.chatsByWorkspaceId, get().currentChat),
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: getErrorMessage(error, "工作区列表刷新失败，请重试。"),
      });
    }
  },
  createWorkspace: async (input) => {
    await createWorkspaceApi({
      name: input.name.trim(),
      description: input.description.trim(),
      path: input.path.trim(),
      groupId: "",
    });
    await get().refreshWorkspaces();
  },
  updateWorkspace: async (workspaceId, input) => {
    const workspace = get().workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error("工作区不存在");
    }

    await updateWorkspaceApi(workspaceId, {
      name: input.name.trim(),
      description: input.description.trim(),
      path: workspace.path,
      groupId: workspace.groupId ?? "",
    });
    await get().refreshWorkspaces();
  },
  deleteWorkspace: async (workspaceId) => {
    set({ error: "" });
    try {
      const workspace = get().workspaces.find((item) => item.id === workspaceId);
      if (workspace) {
        const closed = await chatService.closeWorkspace(workspace.path);
        if (!closed.ok) throw new Error(closed.error);
      }
      await deleteWorkspaceApi(workspaceId);
      const currentWorkspaceDeleted = get().currentWorkspace?.id === workspaceId;
      const workspaces = get().workspaces.filter((workspace) => workspace.id !== workspaceId);

      set((state) => {
        const chatsByWorkspaceId = { ...state.chatsByWorkspaceId };
        const chatActivityMap = { ...state.chatActivityMap };
        delete chatsByWorkspaceId[workspaceId];
        delete chatActivityMap[workspaceId];
        return {
          workspaces,
          chatsByWorkspaceId,
          chatActivityMap,
          openChats: state.openChats.filter((chat) => chat.workspaceId !== workspaceId),
          currentChat: state.currentChat?.workspaceId === workspaceId ? null : state.currentChat,
        };
      });

      if (currentWorkspaceDeleted) {
        get().setCurrentWorkspace(resolveCurrentWorkspace(workspaces, null));
      }
    } catch (error) {
      set({
        error: getErrorMessage(error, "工作区删除失败，请重试。"),
      });
      throw error;
    }
  },
}));
