import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WorkspaceSkillSettings } from "./types";

export async function getWorkspaceSkills(workspaceId: string) {
  if (!isTauri()) {
    return { skills: [] } satisfies WorkspaceSkillSettings;
  }

  return invoke<WorkspaceSkillSettings>("get_workspace_skills", { workspaceId });
}

export async function saveWorkspaceSkills(
  workspaceId: string,
  enabledSkillNames: string[],
) {
  if (!isTauri()) {
    return { skills: [] } satisfies WorkspaceSkillSettings;
  }

  return invoke<WorkspaceSkillSettings>("save_workspace_skills", {
    input: { workspaceId, enabledSkillNames },
  });
}
