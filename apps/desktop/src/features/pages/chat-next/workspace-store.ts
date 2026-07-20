import { invoke, isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";

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
  isLoading: boolean;
  error: string;
  loadWorkspaces: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (input: { name: string; description: string; path: string }) => Promise<void>;
  updateWorkspace: (workspaceId: string, input: { name: string; description: string }) => Promise<void>;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
};

const getWorkspaceOverview = async (): Promise<Workspace[]> => {
  if (!isTauri()) {
    return [];
  }

  const response = await invoke<{ workspaces: Workspace[] }>("get_workspace_overview");
  return response.workspaces;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "工作区列表加载失败，请重试。";
};

const sortWorkspaces = (workspaces: Workspace[]) =>
  [...workspaces].sort(
    (left, right) =>
      Number(right.isPinned) - Number(left.isPinned) ||
      left.order - right.order ||
      left.name.localeCompare(right.name, "zh-CN"),
  );

const fetchWorkspaces = async () => {
  const workspaces = await getWorkspaceOverview();

  return sortWorkspaces(
    workspaces.map((workspace) => (workspace.isDefault ? { ...workspace, name: "默认工作区" } : workspace)),
  );
};

const resolveCurrentWorkspace = (workspaces: Workspace[], currentWorkspace: Workspace | null) =>
  workspaces.find((workspace) => workspace.id === currentWorkspace?.id) ??
  workspaces.find((workspace) => workspace.isDefault) ??
  null;

export const useChatNextWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  isLoading: true,
  error: "",
  loadWorkspaces: async () => {
    set({ isLoading: true, error: "" });

    try {
      const workspaces = await fetchWorkspaces();
      const currentWorkspace = resolveCurrentWorkspace(workspaces, get().currentWorkspace);

      set({
        workspaces,
        currentWorkspace,
      });
    } catch (error) {
      set({
        workspaces: [],
        currentWorkspace: null,
        error: getErrorMessage(error),
      });
    } finally {
      set({ isLoading: false });
    }
  },
  refreshWorkspaces: async () => {
    const previousWorkspaceIds = new Set(get().workspaces.map((workspace) => workspace.id));
    set({ isLoading: true, error: "" });

    try {
      const workspaces = await fetchWorkspaces();
      const createdWorkspace = workspaces
        .filter((workspace) => !workspace.isDefault && !previousWorkspaceIds.has(workspace.id))
        .sort((left, right) => right.createdAt - left.createdAt)[0];
      const currentWorkspace = createdWorkspace ?? resolveCurrentWorkspace(workspaces, get().currentWorkspace);

      set({
        workspaces,
        currentWorkspace,
      });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    } finally {
      set({ isLoading: false });
    }
  },
  createWorkspace: async (input) => {
    if (!isTauri()) {
      throw new Error("Web 预览模式暂不支持创建工作区");
    }

    await invoke<Workspace>("create_workspace", {
      input: {
        name: input.name.trim(),
        description: input.description.trim(),
        path: input.path.trim(),
        groupId: null,
      },
    });
    await get().refreshWorkspaces();
  },
  updateWorkspace: async (workspaceId, input) => {
    if (!isTauri()) {
      throw new Error("Web 预览模式暂不支持保存工作区");
    }

    const workspace = get().workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error("工作区不存在");
    }

    await invoke<Workspace>("update_workspace", {
      input: {
        id: workspaceId,
        name: input.name.trim(),
        description: input.description.trim(),
        path: workspace.path,
        groupId: workspace.groupId,
      },
    });
    await get().refreshWorkspaces();
  },
  setCurrentWorkspace: (workspace) => {
    set({ currentWorkspace: workspace });
  },
}));
