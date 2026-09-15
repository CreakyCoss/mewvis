import { invoke } from "@/transport";
import {
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
  return invoke<SkillSettings>("get_skills");
}

export async function saveSkills(skillGroups: SaveSkillGroupInput[], defaultGroupId: string) {
  return invoke<SkillSettings>("save_skills", {
    input: { skillGroups, defaultGroupId },
  });
}

export async function searchSkillMarketplace(input: SearchSkillMarketplaceInput) {
  return invoke<SkillMarketplaceSearchResult>("search_skill_marketplace", {
    input,
  });
}

export async function installSkillFromMarketplace(input: InstallSkillInput) {
  return invoke<InstalledSkill>("install_skill_from_marketplace", {
    input,
  });
}

export async function removeAppSkill(input: RemoveSkillInput) {
  return invoke<RemovedSkill>("remove_app_skill", {
    input,
  });
}
