import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  ALL_SKILLS_GROUP_ID,
  type InstallSkillInput,
  type InstalledSkill,
  type RemoveSkillInput,
  type RemovedSkill,
  type SaveSkillGroupInput,
  type SearchSkillMarketplaceInput,
  type SkillMarketplaceSearchResult,
  type SkillSettings,
} from "@/workbench/pages/skills/types";

export async function getSkills() {
  if (!isTauri()) {
    return { skills: [], groups: [], defaultGroupId: ALL_SKILLS_GROUP_ID } satisfies SkillSettings;
  }

  return invoke<SkillSettings>("get_skills");
}

export async function saveSkills(skillGroups: SaveSkillGroupInput[], defaultGroupId: string) {
  if (!isTauri()) {
    return { skills: [], groups: [], defaultGroupId } satisfies SkillSettings;
  }

  return invoke<SkillSettings>("save_skills", {
    input: { skillGroups, defaultGroupId },
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
