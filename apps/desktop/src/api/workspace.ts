import { invoke, isTauri } from "@tauri-apps/api/core";
import { createWebDefaultWorkspaceOverview } from "@/features/pages/workspace/default";
import type { Workspace, WorkspaceForm, WorkspaceOverview } from "@/features/pages/workspace/types";

export async function getWorkspaceOverview() {
  if (!isTauri()) {
    return createWebDefaultWorkspaceOverview();
  }

  return invoke<WorkspaceOverview>("get_workspace_overview");
}

export async function listWorkspaces() {
  if (!isTauri()) {
    return [];
  }

  const overview = await invoke<WorkspaceOverview>("get_workspace_overview");
  return overview.workspaces;
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
