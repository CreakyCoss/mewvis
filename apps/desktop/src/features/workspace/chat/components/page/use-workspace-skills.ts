import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  getWorkspaceSkills,
  installSkillFromMarketplace,
  removeAppSkill,
  saveWorkspaceSkills,
  searchSkillMarketplace,
} from "@/features/skills/api";
import {
  useSkillsStore,
} from "@/features/skills/store";
import type {
  InstallSkillInput,
  RemoveSkillInput,
  SaveWorkspaceSkillGroupInput,
  SearchSkillMarketplaceInput,
  WorkspaceSkillGroup,
} from "@/features/skills/types";

type UseWorkspaceSkillsInput = {
  workspaceId: string;
};

export const useWorkspaceSkills = ({ workspaceId }: UseWorkspaceSkillsInput) => {
  const [skillsError, setSkillsError] = useState("");
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [isSkillsSaving, setIsSkillsSaving] = useState(false);
  const [isSkillMarketplaceSearching, setIsSkillMarketplaceSearching] = useState(false);
  const [isSkillMarketplaceLoadingMore, setIsSkillMarketplaceLoadingMore] = useState(false);
  const [isSkillInstalling, setIsSkillInstalling] = useState(false);
  const [isSkillRemoving, setIsSkillRemoving] = useState(false);
  const {
    skills,
    skillGroups,
    enabledSkillNames,
    marketplaceResults,
    marketplacePagination,
    marketplaceQuery,
    marketplaceSortBy,
    marketplaceHasLoaded,
    setWorkspaceSkillSettings,
    setSkillGroups,
    setMarketplaceSearchResult,
    restoreMarketplaceCache,
    resetDrafts,
    toggleSkill,
    toggleGroup,
  } = useSkillsStore(
    useShallow((store) => ({
      skills: store.skills,
      skillGroups: store.skillGroups,
      enabledSkillNames: store.enabledSkillNames,
      marketplaceResults: store.marketplaceResults,
      marketplacePagination: store.marketplacePagination,
      marketplaceQuery: store.marketplaceQuery,
      marketplaceSortBy: store.marketplaceSortBy,
      marketplaceHasLoaded: store.marketplaceHasLoaded,
      setWorkspaceSkillSettings: store.setWorkspaceSkillSettings,
      setSkillGroups: store.setSkillGroups,
      setMarketplaceSearchResult: store.setMarketplaceSearchResult,
      restoreMarketplaceCache: store.restoreMarketplaceCache,
      resetDrafts: store.resetDrafts,
      toggleSkill: store.toggleSkill,
      toggleGroup: store.toggleGroup,
    })),
  );

  const loadWorkspaceSkills = useCallback(async () => {
    setIsSkillsLoading(true);
    setSkillsError("");

    try {
      const settings = await getWorkspaceSkills(workspaceId);
      setWorkspaceSkillSettings(settings);
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillsLoading(false);
    }
  }, [setWorkspaceSkillSettings, workspaceId]);

  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills]);

  const enabledSkills = useMemo(() => {
    const names = new Set(enabledSkillNames);
    return skills.filter((skill) => names.has(skill.name));
  }, [enabledSkillNames, skills]);

  const persistSkillSettings = useCallback(async (
    nextEnabledSkillNames: string[],
    nextSkillGroups: WorkspaceSkillGroup[],
  ) => {
    setIsSkillsSaving(true);
    setSkillsError("");

    try {
      const settings = await saveWorkspaceSkills(
        workspaceId,
        [...nextEnabledSkillNames].sort(),
        toSaveSkillGroups(nextSkillGroups),
      );
      setWorkspaceSkillSettings(settings);
    } catch (caught) {
      setSkillsError(String(caught));
      resetDrafts();
    } finally {
      setIsSkillsSaving(false);
    }
  }, [resetDrafts, setWorkspaceSkillSettings, workspaceId]);

  const updateSkillGroups = useCallback((groups: WorkspaceSkillGroup[]) => {
    setSkillGroups(groups);
    void persistSkillSettings(enabledSkillNames, groups);
  }, [enabledSkillNames, persistSkillSettings, setSkillGroups]);

  const toggleWorkspaceSkill = useCallback((name: string, enabled: boolean) => {
    const nextEnabledSkillNames = nextEnabledAfterSkillToggle(
      enabledSkillNames,
      name,
      enabled,
    );
    toggleSkill(name, enabled);
    void persistSkillSettings(nextEnabledSkillNames, skillGroups);
  }, [enabledSkillNames, persistSkillSettings, skillGroups, toggleSkill]);

  const toggleWorkspaceSkillGroup = useCallback((
    skillNames: string[],
    enabled: boolean,
  ) => {
    const nextEnabledSkillNames = nextEnabledAfterGroupToggle(
      enabledSkillNames,
      skillNames,
      enabled,
    );
    toggleGroup(skillNames, enabled);
    void persistSkillSettings(nextEnabledSkillNames, skillGroups);
  }, [enabledSkillNames, persistSkillSettings, skillGroups, toggleGroup]);

  const searchMarketplace = useCallback(async (input: SearchSkillMarketplaceInput) => {
    const normalizedInput = {
      ...input,
      page: input.page ?? 1,
      limit: input.limit ?? 12,
    };
    const isAppend = normalizedInput.append === true;

    if (!isAppend && restoreMarketplaceCache(normalizedInput)) {
      return;
    }

    if (isAppend) {
      setIsSkillMarketplaceLoadingMore(true);
    } else {
      setIsSkillMarketplaceSearching(true);
    }
    setSkillsError("");

    try {
      const result = await searchSkillMarketplace(normalizedInput);
      setMarketplaceSearchResult(normalizedInput, result);
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      if (isAppend) {
        setIsSkillMarketplaceLoadingMore(false);
      } else {
        setIsSkillMarketplaceSearching(false);
      }
    }
  }, [restoreMarketplaceCache, setMarketplaceSearchResult]);

  const installMarketplaceSkill = useCallback(async (input: InstallSkillInput) => {
    setIsSkillInstalling(true);
    setSkillsError("");

    try {
      const installedSkill = await installSkillFromMarketplace(input);
      await loadWorkspaceSkills();
      toast.success("技能导入成功", {
        description: `${installedSkill.name} 已添加到 Skill库`,
      });
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillInstalling(false);
    }
  }, [loadWorkspaceSkills]);

  const removeMarketplaceSkill = useCallback(async (input: RemoveSkillInput) => {
    setIsSkillRemoving(true);
    setSkillsError("");

    try {
      const removedSkill = await removeAppSkill(input);
      const nextEnabledSkillNames = enabledSkillNames.filter(
        (name) => name !== removedSkill.name,
      );
      const nextSkillGroups = skillGroups.map((group) =>
        group.source === "custom"
          ? {
              ...group,
              skillNames: group.skillNames.filter((name) => name !== removedSkill.name),
            }
          : group,
      );
      const settings = await saveWorkspaceSkills(
        workspaceId,
        nextEnabledSkillNames,
        toSaveSkillGroups(nextSkillGroups),
      );
      setWorkspaceSkillSettings(settings);
      toast.success("技能已移除", {
        description: `${removedSkill.name} 已从 Skill库移除`,
      });
    } catch (caught) {
      setSkillsError(String(caught));
      await loadWorkspaceSkills();
    } finally {
      setIsSkillRemoving(false);
    }
  }, [
    enabledSkillNames,
    loadWorkspaceSkills,
    setWorkspaceSkillSettings,
    skillGroups,
    workspaceId,
  ]);

  return {
    skills,
    skillGroups,
    enabledSkillNames,
    enabledSkills,
    skillsError,
    isSkillsLoading,
    isSkillsSaving,
    isSkillMarketplaceSearching,
    isSkillMarketplaceLoadingMore,
    isSkillInstalling,
    isSkillRemoving,
    skillMarketplaceResults: marketplaceResults,
    skillMarketplacePagination: marketplacePagination,
    skillMarketplaceQuery: marketplaceQuery,
    skillMarketplaceSortBy: marketplaceSortBy,
    skillMarketplaceHasLoaded: marketplaceHasLoaded,
    toggleWorkspaceSkill,
    toggleWorkspaceSkillGroup,
    updateSkillGroups,
    searchMarketplace,
    installMarketplaceSkill,
    removeMarketplaceSkill,
  };
};

const toSaveSkillGroups = (
  groups: WorkspaceSkillGroup[],
): SaveWorkspaceSkillGroupInput[] =>
  groups
    .filter((group) => group.source === "custom")
    .map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      skillNames: group.skillNames,
    }));

const nextEnabledAfterSkillToggle = (
  enabledSkillNames: string[],
  name: string,
  enabled: boolean,
) => {
  const next = new Set(enabledSkillNames);
  if (enabled) {
    next.add(name);
  } else {
    next.delete(name);
  }
  return [...next].sort();
};

const nextEnabledAfterGroupToggle = (
  enabledSkillNames: string[],
  skillNames: string[],
  enabled: boolean,
) => {
  const next = new Set(enabledSkillNames);
  for (const name of skillNames) {
    if (enabled) {
      next.add(name);
    } else {
      next.delete(name);
    }
  }
  return [...next].sort();
};
