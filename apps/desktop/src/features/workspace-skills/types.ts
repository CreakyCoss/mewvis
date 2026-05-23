export type WorkspaceSkill = {
  name: string;
  description: string;
  content: string;
  enabled: boolean;
};

export type WorkspaceSkillSettings = {
  skills: WorkspaceSkill[];
};
