import { useCallback, useEffect, useMemo, useState } from "react";
import { getWorkspaceSkills, saveWorkspaceSkills } from "@/features/workspace-skills/api";
import type { WorkspaceSkill } from "@/features/workspace-skills/types";

type UseWorkspaceSkillsInput = {
  workspaceId: string;
};

export const useWorkspaceSkills = ({ workspaceId }: UseWorkspaceSkillsInput) => {
  const [skills, setSkills] = useState<WorkspaceSkill[]>([]);
  const [enabledSkillNames, setEnabledSkillNames] = useState<string[]>([]);
  const [isSkillsDialogOpen, setIsSkillsDialogOpen] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [isSkillsSaving, setIsSkillsSaving] = useState(false);

  const loadWorkspaceSkills = useCallback(async () => {
    setIsSkillsLoading(true);
    setSkillsError("");

    try {
      const settings = await getWorkspaceSkills(workspaceId);
      setSkills(settings.skills);
      setEnabledSkillNames(
        settings.skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills]);

  const enabledSkills = useMemo(() => {
    const names = new Set(enabledSkillNames);
    return skills.filter((skill) => names.has(skill.name));
  }, [enabledSkillNames, skills]);

  const toggleWorkspaceSkill = useCallback((name: string, enabled: boolean) => {
    setEnabledSkillNames((current) => {
      const next = new Set(current);
      if (enabled) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return [...next].sort();
    });
  }, []);

  const handleSkillsDialogOpenChange = useCallback((open: boolean) => {
    setIsSkillsDialogOpen(open);
    if (!open) {
      setEnabledSkillNames(
        skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
    }
  }, [skills]);

  const saveSkills = useCallback(async () => {
    setIsSkillsSaving(true);
    setSkillsError("");

    try {
      const settings = await saveWorkspaceSkills(workspaceId, enabledSkillNames);
      setSkills(settings.skills);
      setEnabledSkillNames(
        settings.skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
      setIsSkillsDialogOpen(false);
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillsSaving(false);
    }
  }, [enabledSkillNames, workspaceId]);

  return {
    skills,
    enabledSkillNames,
    enabledSkills,
    isSkillsDialogOpen,
    setIsSkillsDialogOpen,
    skillsError,
    isSkillsLoading,
    isSkillsSaving,
    toggleWorkspaceSkill,
    handleSkillsDialogOpenChange,
    saveSkills,
  };
};
