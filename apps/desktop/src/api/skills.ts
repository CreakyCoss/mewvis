import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  InstallSkillInput,
  InstalledSkill,
  RemoveSkillInput,
  RemovedSkill,
  SaveWorkspaceSkillGroupInput,
  SearchSkillMarketplaceInput,
  SkillMarketplaceSearchResult,
  WorkspaceSkillSettings,
} from "@/features/pages/skills/types";

export async function getWorkspaceSkills(workspaceId: string) {
  if (!isTauri()) {
    return { skills: [], groups: [], defaultGroupId: "all" } satisfies WorkspaceSkillSettings;
  }

  return invoke<WorkspaceSkillSettings>("get_workspace_skills", { workspaceId });
}

export async function saveWorkspaceSkills(
  workspaceId: string,
  skillGroups: SaveWorkspaceSkillGroupInput[],
  defaultGroupId: string,
) {
  if (!isTauri()) {
    return { skills: [], groups: [], defaultGroupId } satisfies WorkspaceSkillSettings;
  }

  return invoke<WorkspaceSkillSettings>("save_workspace_skills", {
    input: { workspaceId, skillGroups, defaultGroupId },
  });
}

export async function searchSkillMarketplace(input: SearchSkillMarketplaceInput) {
  if (!isTauri()) {
    return {
      skills: [],
      pagination: {
        page: input.page ?? 1,
        limit: input.limit ?? 12,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
        totalIsExact: true,
      },
    } satisfies SkillMarketplaceSearchResult;
  }

  return invoke<SkillMarketplaceSearchResult>("search_skill_marketplace", {
    input,
  });
}

export async function installSkillFromMarketplace(input: InstallSkillInput) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持安装技能");
  }

  return invoke<InstalledSkill>("install_skill_from_marketplace", {
    input,
  });
}

export async function removeAppSkill(input: RemoveSkillInput) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持移除技能");
  }

  return invoke<RemovedSkill>("remove_app_skill", {
    input,
  });
}
