import { invoke, isTauri } from "@tauri-apps/api/core";

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

export type WorkspaceForm = {
  name: string;
  description: string;
  path: string;
  groupId: string;
};

export async function listWorkspaces() {
  if (!isTauri()) {
    return [];
  }

  return invoke<Workspace[]>("list_workspaces");
}

export async function createWorkspace(input: WorkspaceForm) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持创建工作区");
  }

  return invoke<Workspace>("create_workspace", {
    input: {
      name: input.name,
      description: input.description,
      path: input.path,
      groupId: input.groupId,
    },
  });
}

export async function updateWorkspace(workspaceId: string, input: WorkspaceForm) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持保存工作区");
  }

  return invoke<Workspace>("update_workspace", {
    input: {
      id: workspaceId,
      name: input.name,
      description: input.description,
      path: input.path,
      groupId: input.groupId,
    },
  });
}

export async function deleteWorkspace(workspaceId: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持删除工作区");
  }

  return invoke<void>("delete_workspace", {
    input: {
      id: workspaceId,
    },
  });
}
