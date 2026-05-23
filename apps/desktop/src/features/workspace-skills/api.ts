import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceSkillSettings } from "./types";

export async function getWorkspaceSkills(workspaceId: string) {
  return invoke<WorkspaceSkillSettings>("get_workspace_skills", { workspaceId });
}

export async function saveWorkspaceSkills(
  workspaceId: string,
  enabledSkillNames: string[],
) {
  return invoke<WorkspaceSkillSettings>("save_workspace_skills", {
    input: { workspaceId, enabledSkillNames },
  });
}
