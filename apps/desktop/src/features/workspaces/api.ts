import { invoke } from "@tauri-apps/api/core";
import type { Workspace, WorkspaceForm, WorkspaceOverview } from "./types";

export async function getWorkspaceOverview() {
  return invoke<WorkspaceOverview>("get_workspace_overview");
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
