import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  getWorkspaceSkills,
  installSkillFromMarketplace,
  removeAppSkill,
  saveWorkspaceSkills,
  searchSkillMarketplace,
} from "@/features/pages/skills/api";
import { useSkillsStore } from "@/features/pages/skills/store";
import type {
  InstallSkillInput,
  RemoveSkillInput,
  SaveWorkspaceSkillGroupInput,
  SearchSkillMarketplaceInput,
  WorkspaceSkillGroup,
} from "@/features/pages/skills/types";

type UseWorkspaceSkillsInput = {
  enabled?: boolean;
  workspaceId: string;
};

export const useWorkspaceSkills = ({ enabled = true, workspaceId }: UseWorkspaceSkillsInput) => {
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
    defaultSkillGroupId,
    marketplaceResults,
    marketplacePagination,
    marketplaceQuery,
    marketplaceSortBy,
    marketplaceHasLoaded,
    setWorkspaceSkillSettings,
    setSkillGroups,
    setDefaultSkillGroupId,
    setMarketplaceSearchResult,
    restoreMarketplaceCache,
    resetDrafts,
  } = useSkillsStore(
    useShallow((store) => ({
      skills: store.skills,
      skillGroups: store.skillGroups,
      defaultSkillGroupId: store.defaultSkillGroupId,
      marketplaceResults: store.marketplaceResults,
      marketplacePagination: store.marketplacePagination,
      marketplaceQuery: store.marketplaceQuery,
      marketplaceSortBy: store.marketplaceSortBy,
      marketplaceHasLoaded: store.marketplaceHasLoaded,
      setWorkspaceSkillSettings: store.setWorkspaceSkillSettings,
      setSkillGroups: store.setSkillGroups,
      setDefaultSkillGroupId: store.setDefaultSkillGroupId,
      setMarketplaceSearchResult: store.setMarketplaceSearchResult,
      restoreMarketplaceCache: store.restoreMarketplaceCache,
      resetDrafts: store.resetDrafts,
    })),
  );

  const loadWorkspaceSkills = useCallback(async () => {
    if (!enabled) {
      setSkillsError("");
      setIsSkillsLoading(false);
      return;
    }
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
  }, [enabled, setWorkspaceSkillSettings, workspaceId]);

  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills]);

  const persistSkillSettings = useCallback(
    async (nextSkillGroups: WorkspaceSkillGroup[], nextDefaultSkillGroupId: string) => {
      setIsSkillsSaving(true);
      setSkillsError("");

      try {
        const settings = await saveWorkspaceSkills(
          workspaceId,
          toSaveSkillGroups(nextSkillGroups),
          nextDefaultSkillGroupId,
        );
        setWorkspaceSkillSettings(settings);
      } catch (caught) {
        setSkillsError(String(caught));
        resetDrafts();
      } finally {
        setIsSkillsSaving(false);
      }
    },
    [resetDrafts, setWorkspaceSkillSettings, workspaceId],
  );

  const updateSkillGroups = useCallback(
    (groups: WorkspaceSkillGroup[], nextDefaultSkillGroupId = defaultSkillGroupId) => {
      setSkillGroups(groups);
      setDefaultSkillGroupId(nextDefaultSkillGroupId);
      void persistSkillSettings(groups, nextDefaultSkillGroupId);
    },
    [defaultSkillGroupId, persistSkillSettings, setDefaultSkillGroupId, setSkillGroups],
  );

  const updateDefaultSkillGroup = useCallback(
    (nextDefaultSkillGroupId: string) => {
      setDefaultSkillGroupId(nextDefaultSkillGroupId);
      void persistSkillSettings(skillGroups, nextDefaultSkillGroupId);
    },
    [persistSkillSettings, setDefaultSkillGroupId, skillGroups],
  );

  const searchMarketplace = useCallback(
    async (input: SearchSkillMarketplaceInput) => {
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
    },
    [restoreMarketplaceCache, setMarketplaceSearchResult],
  );

  const installMarketplaceSkill = useCallback(
    async (input: InstallSkillInput) => {
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
    },
    [loadWorkspaceSkills],
  );

  const removeMarketplaceSkill = useCallback(
    async (input: RemoveSkillInput) => {
      setIsSkillRemoving(true);
      setSkillsError("");

      try {
        const removedSkill = await removeAppSkill(input);
        const nextSkillGroups = skillGroups.map((group) =>
          group.source === "custom"
            ? {
                ...group,
                skills: group.skills.filter((skill) => skill.key !== removedSkill.key),
              }
            : group,
        );
        const settings = await saveWorkspaceSkills(
          workspaceId,
          toSaveSkillGroups(nextSkillGroups),
          defaultSkillGroupId,
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
    },
    [loadWorkspaceSkills, defaultSkillGroupId, setWorkspaceSkillSettings, skillGroups, workspaceId],
  );

  return {
    skills,
    skillGroups,
    defaultSkillGroupId,
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
    updateSkillGroups,
    updateDefaultSkillGroup,
    searchMarketplace,
    installMarketplaceSkill,
    removeMarketplaceSkill,
  };
};

const toSaveSkillGroups = (groups: WorkspaceSkillGroup[]): SaveWorkspaceSkillGroupInput[] =>
  groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    source: group.source,
    readonly: group.readonly,
    skills: group.skills.map((skill) => ({
      key: skill.key,
      disabled: skill.disabled === true,
    })),
  }));
