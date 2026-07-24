import { create } from "zustand";
import {
  deleteChat as deleteChatApi,
  listChats,
  saveChat as saveChatApi,
  type ChatMeta,
  type ChatRecord,
  type SaveChatInput,
} from "@/api/chat";
import {
  createWorkspace as createWorkspaceApi,
  deleteWorkspace as deleteWorkspaceApi,
  listWorkspaces,
  updateWorkspace as updateWorkspaceApi,
} from "@/api/workspace";
import type { ChatInputResources } from "../components/chat-input/type";
import { loadResources } from "../resources";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  path: string;
  isDefault: boolean;
  isPinned: boolean;
  order: number;
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
};

type WorkspaceStore = {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  resources: ChatInputResources;
  chatsByWorkspaceId: Record<string, ChatMeta[]>;
  chatLoadingMap: Record<string, boolean>;
  isLoading: boolean;
  error: string;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  saveChat: (workspace: Workspace, input: Omit<SaveChatInput, "workspacePath">) => Promise<ChatRecord>;
  setChatLoading: (chatId: string, isLoading: boolean) => void;
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
    resources: await loadResources(nextWorkspace?.id ?? ""),
  };
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  resources: {},
  chatsByWorkspaceId: {},
  chatLoadingMap: {},
  isLoading: false,
  error: "",
  setCurrentWorkspace: (workspace) => {
    set({
      currentWorkspace: workspace,
      resources: {},
      error: "",
    });
    void loadResources(workspace?.id ?? "").then((resources) => {
      if (get().currentWorkspace?.id === workspace?.id) {
        set({ resources });
      }
    });
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
  setChatLoading: (chatId, isLoading) => {
    set((state) => {
      const chatLoadingMap = { ...state.chatLoadingMap };
      if (isLoading) {
        chatLoadingMap[chatId] = true;
      } else {
        delete chatLoadingMap[chatId];
      }

      return { chatLoadingMap };
    });
  },
  deleteChat: async (workspace, chatId) => {
    const previousChats = get().chatsByWorkspaceId[workspace.id] ?? [];
    const deletedChat = previousChats.find((chat) => chat.id === chatId);
    const wasLoading = Boolean(get().chatLoadingMap[chatId]);
    set((state) => {
      const chatLoadingMap = { ...state.chatLoadingMap };
      delete chatLoadingMap[chatId];

      return {
        chatsByWorkspaceId: {
          ...state.chatsByWorkspaceId,
          [workspace.id]: previousChats.filter((chat) => chat.id !== chatId),
        },
        chatLoadingMap,
        error: "",
      };
    });

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
          ? {
              ...state.chatLoadingMap,
              [chatId]: true,
            }
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
        isLoading: false,
      });
    } catch (error) {
      set({
        workspaces: [],
        currentWorkspace: null,
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
        delete chatsByWorkspaceId[workspaceId];
        return {
          workspaces,
          chatsByWorkspaceId,
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
