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
  selectedWorkspaceId: string | null;
  isLoading: boolean;
  error: string;
  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (workspace: Workspace | null) => void;
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

export const useChatNextWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  selectedWorkspaceId: null,
  isLoading: true,
  error: "",
  loadWorkspaces: async () => {
    set({ isLoading: true, error: "" });

    try {
      const responseWorkspaces = await getWorkspaceOverview();
      const workspaces = sortWorkspaces(responseWorkspaces);
      const currentWorkspaceId = get().selectedWorkspaceId;
      const fallbackWorkspace = workspaces.find((workspace) => workspace.isDefault) ?? workspaces[0] ?? null;
      const selectedWorkspace =
        workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? fallbackWorkspace;

      set({
        workspaces,
        selectedWorkspaceId: selectedWorkspace?.id ?? null,
      });
    } catch (error) {
      set({
        workspaces: [],
        selectedWorkspaceId: null,
        error: getErrorMessage(error),
      });
    } finally {
      set({ isLoading: false });
    }
  },
  selectWorkspace: (workspace) => {
    set({ selectedWorkspaceId: workspace?.id ?? null });
  },
}));
