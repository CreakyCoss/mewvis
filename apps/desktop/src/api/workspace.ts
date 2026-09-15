import { invoke } from "@/transport";

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
  return invoke<Workspace[]>("list_workspaces");
}

export async function createWorkspace(input: WorkspaceForm) {
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
  return invoke<void>("delete_workspace", {
    input: {
      id: workspaceId,
    },
  });
}
