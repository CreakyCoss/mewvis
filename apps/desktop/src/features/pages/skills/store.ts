import { create } from "zustand";
import { ALL_SKILLS_GROUP_ID, type Skill, type SkillGroup, type SkillSettings } from "./types";

type SkillsStore = {
  skills: Skill[];
  skillGroups: SkillGroup[];
  defaultSkillGroupId: string;
  setSkillSettings: (settings: SkillSettings) => void;
  setSkillGroups: (groups: SkillGroup[]) => void;
  setDefaultSkillGroupId: (groupId: string) => void;
};

export const useSkillsStore = create<SkillsStore>((set) => ({
  skills: [],
  skillGroups: [],
  defaultSkillGroupId: ALL_SKILLS_GROUP_ID,
  setSkillSettings: (settings) => {
    const defaultSkillGroupId = settings.defaultGroupId || ALL_SKILLS_GROUP_ID;
    set({
      skills: settings.skills,
      skillGroups: settings.groups,
      defaultSkillGroupId,
    });
  },
  setSkillGroups: (groups) => set({ skillGroups: groups }),
  setDefaultSkillGroupId: (groupId) => set({ defaultSkillGroupId: groupId }),
}));
