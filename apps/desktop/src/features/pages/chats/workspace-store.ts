import { create } from "zustand";
import {
  deleteChat as deleteChatApi,
  listChats,
  saveChat as saveChatApi,
  setChatUnread as setChatUnreadApi,
  type ChatMeta,
  type ChatRecord,
  type SaveChatInput,
} from "@/api/chat";
import {
  createWorkspace as createWorkspaceApi,
  deleteWorkspace as deleteWorkspaceApi,
  listWorkspaces,
  updateWorkspace as updateWorkspaceApi,
  type Workspace,
} from "@/api/workspace";
import type { ChatInitialData } from "./chat/type";
import type { ChatInputResources } from "./components/chat-input/type";
import { loadResources } from "./resources";

type CurrentChat = {
  workspaceId: string;
  chatId: string;
};

export type OpenChat = CurrentChat & {
  initialData?: ChatInitialData;
};

type ChatLoadingMap = Record<string, Record<string, boolean>>;

const MAX_OPEN_CHAT_COUNT = 5;

type WorkspaceStore = {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentChat: CurrentChat | null;
  openChats: OpenChat[];
  resources: ChatInputResources;
  chatsByWorkspaceId: Record<string, ChatMeta[]>;
  chatLoadingMap: ChatLoadingMap;
  isLoading: boolean;
  error: string;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setCurrentChat: (chat: CurrentChat | null) => void;
  openChat: (chat: OpenChat) => void;
  saveChat: (workspace: Workspace, input: Omit<SaveChatInput, "workspacePath">) => Promise<ChatRecord>;
  setChatLoading: (workspaceId: string, chatId: string, isLoading: boolean) => void;
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

const updateChatLoading = (chatLoadingMap: ChatLoadingMap, workspaceId: string, chatId: string, isLoading: boolean) => {
  const nextMap = { ...chatLoadingMap };
  const workspaceChatLoadingMap = { ...nextMap[workspaceId] };

  if (isLoading) {
    workspaceChatLoadingMap[chatId] = true;
  } else {
    delete workspaceChatLoadingMap[chatId];
  }

  if (Object.keys(workspaceChatLoadingMap).length > 0) {
    nextMap[workspaceId] = workspaceChatLoadingMap;
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
    resources: await loadResources(),
  };
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  currentChat: null,
  openChats: [],
  resources: {},
  chatsByWorkspaceId: {},
  chatLoadingMap: {},
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
      void setChatUnreadApi({
        workspacePath: workspace.path,
        chatId: chat.chatId,
        isUnread: false,
      }).catch((error) => {
        set({
          error: getErrorMessage(error, "对话已读状态更新失败，请重试。"),
        });
      });
    }
  },
  openChat: (chat) => {
    set((state) => {
      const existingChatIndex = state.openChats.findIndex((item) => isSameChat(item, chat));
      if (existingChatIndex >= 0) {
        if (!chat.initialData) {
          return state;
        }

        return {
          openChats: state.openChats.map((item, index) =>
            index === existingChatIndex ? { ...item, initialData: chat.initialData } : item,
          ),
        };
      }

      if (state.openChats.length < MAX_OPEN_CHAT_COUNT) {
        return { openChats: [...state.openChats, chat] };
      }

      const removableChatIndex = state.openChats.findIndex(
        (item) => !isSameChat(state.currentChat, item) && !state.chatLoadingMap[item.workspaceId]?.[item.chatId],
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
  saveChat: async (workspace, input) => {
    set({ error: "" });
    try {
      const chat = await saveChatApi({
        ...input,
        workspacePath: workspace.path,
      });
      set((state) => {
        const chats = state.chatsByWorkspaceId[workspace.id] ?? [];
        const previous = chats.find((item) => item.id === chat.id);

        return {
          chatsByWorkspaceId: {
            ...state.chatsByWorkspaceId,
            [workspace.id]: mergeChatMeta(chats, chatToMeta(chat, previous)),
          },
        };
      });
      return chat;
    } catch (error) {
      set({
        error: getErrorMessage(error, "对话保存失败，请重试。"),
      });
      throw error;
    }
  },
  setChatLoading: (workspaceId, chatId, isLoading) => {
    const wasLoading = Boolean(get().chatLoadingMap[workspaceId]?.[chatId]);
    const shouldMarkUnread =
      wasLoading &&
      !isLoading &&
      (get().currentChat?.chatId !== chatId || get().currentChat?.workspaceId !== workspaceId);
    const workspace =
      get().workspaces.find((item) => item.id === workspaceId) ??
      (get().currentWorkspace?.id === workspaceId ? get().currentWorkspace : null);

    set((state) => {
      const chatLoadingMap = updateChatLoading(state.chatLoadingMap, workspaceId, chatId, isLoading);

      return {
        chatLoadingMap,
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

      void setChatUnreadApi({
        workspacePath: workspace.path,
        chatId,
        isUnread: true,
      }).catch((error) => {
        set({
          error: getErrorMessage(error, "对话未读状态更新失败，请重试。"),
        });
      });
    }
  },
  deleteChat: async (workspace, chatId) => {
    const previousChats = get().chatsByWorkspaceId[workspace.id] ?? [];
    const deletedChat = previousChats.find((chat) => chat.id === chatId);
    const wasLoading = Boolean(get().chatLoadingMap[workspace.id]?.[chatId]);
    set((state) => ({
      chatsByWorkspaceId: {
        ...state.chatsByWorkspaceId,
        [workspace.id]: previousChats.filter((chat) => chat.id !== chatId),
      },
      chatLoadingMap: updateChatLoading(state.chatLoadingMap, workspace.id, chatId, false),
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
        chatLoadingMap: wasLoading
          ? updateChatLoading(state.chatLoadingMap, workspace.id, chatId, true)
          : state.chatLoadingMap,
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
        resources: {},
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
      await deleteWorkspaceApi(workspaceId);
      const currentWorkspaceDeleted = get().currentWorkspace?.id === workspaceId;
      const workspaces = get().workspaces.filter((workspace) => workspace.id !== workspaceId);

      set((state) => {
        const chatsByWorkspaceId = { ...state.chatsByWorkspaceId };
        const chatLoadingMap = { ...state.chatLoadingMap };
        delete chatsByWorkspaceId[workspaceId];
        delete chatLoadingMap[workspaceId];
        return {
          workspaces,
          chatsByWorkspaceId,
          chatLoadingMap,
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
