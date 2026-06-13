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
    enabledSkillKeys,
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
      enabledSkillKeys: store.enabledSkillKeys,
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
    const keys = new Set(enabledSkillKeys);
    return skills.filter((skill) => keys.has(skill.key));
  }, [enabledSkillKeys, skills]);
  const enabledSkillNames = useMemo(
    () => enabledSkills.map((skill) => skill.name).sort(),
    [enabledSkills],
  );

  const persistSkillSettings = useCallback(async (
    nextEnabledSkillKeys: string[],
    nextSkillGroups: WorkspaceSkillGroup[],
  ) => {
    setIsSkillsSaving(true);
    setSkillsError("");

    try {
      const settings = await saveWorkspaceSkills(
        workspaceId,
        [...nextEnabledSkillKeys].sort(),
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
    void persistSkillSettings(enabledSkillKeys, groups);
  }, [enabledSkillKeys, persistSkillSettings, setSkillGroups]);

  const toggleWorkspaceSkill = useCallback((key: string, enabled: boolean) => {
    const nextEnabledSkillKeys = nextEnabledAfterSkillToggle(
      enabledSkillKeys,
      key,
      enabled,
    );
    toggleSkill(key, enabled);
    void persistSkillSettings(nextEnabledSkillKeys, skillGroups);
  }, [enabledSkillKeys, persistSkillSettings, skillGroups, toggleSkill]);

  const toggleWorkspaceSkillGroup = useCallback((
    skillKeys: string[],
    enabled: boolean,
  ) => {
    const nextEnabledSkillKeys = nextEnabledAfterGroupToggle(
      enabledSkillKeys,
      skillKeys,
      enabled,
    );
    toggleGroup(skillKeys, enabled);
    void persistSkillSettings(nextEnabledSkillKeys, skillGroups);
  }, [enabledSkillKeys, persistSkillSettings, skillGroups, toggleGroup]);

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
      const nextEnabledSkillKeys = enabledSkillKeys.filter(
        (key) => key !== removedSkill.key,
      );
      const nextSkillGroups = skillGroups.map((group) =>
        group.source === "custom"
          ? {
              ...group,
              skillNames: group.skillNames.filter((key) => key !== removedSkill.key),
            }
          : group,
      );
      const settings = await saveWorkspaceSkills(
        workspaceId,
        nextEnabledSkillKeys,
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
    enabledSkillKeys,
    loadWorkspaceSkills,
    setWorkspaceSkillSettings,
    skillGroups,
    workspaceId,
  ]);

  return {
    skills,
    skillGroups,
    enabledSkillKeys,
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
  enabledSkillKeys: string[],
  key: string,
  enabled: boolean,
) => {
  const next = new Set(enabledSkillKeys);
  if (enabled) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return [...next].sort();
};

const nextEnabledAfterGroupToggle = (
  enabledSkillKeys: string[],
  skillKeys: string[],
  enabled: boolean,
) => {
  const next = new Set(enabledSkillKeys);
  for (const key of skillKeys) {
    if (enabled) {
      next.add(key);
    } else {
      next.delete(key);
    }
  }
  return [...next].sort();
};
