import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import type { StoryState } from "@/features/story/model/story-state";
import type { StoryJson } from "@/features/story/model/story-types";
import {
  loadStoryById,
  saveStoryJson,
  updateStoryRecordName,
  type StoryWorkspace,
} from "@/features/story/persistence/story-storage";
import { useStoryManuscripts } from "../use-story-manuscripts";
import type { StoryDraft } from "../story-form-utils";
import type { StoryConfigTab } from "../story-tabs";
import { openRegisteredStoryPresentation, type StoryPresentationChannel } from "../presentations/registry";

export const useStoryState = () => {
  const navigate = useNavigate();
  const { runtimeAgentRequiresModel, selectedRuntimeModel, settingsError } = useRuntimeAgentSettings();
  const { activeWorkspace, defaultWorkspace, overview } = useWorkspaceOverview();
  const tavernWorkspace = activeWorkspace ?? defaultWorkspace ?? overview?.workspaces[0] ?? null;
  const [story, setStory] = useState<StoryJson | null>(null);
  const [storyWorkspace, setStoryWorkspace] = useState<StoryWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<StoryConfigTab>("overview");
  const [isSaving, setIsSaving] = useState(false);
  const [tavernSelectNodeId, setTavernSelectNodeId] = useState<string | null | undefined>(undefined);
  const [openingStoryId, setOpeningStoryId] = useState("");

  const storyState = useMemo<StoryState>(
    () => ({
      version: 1,
      activeStoryId: story?.id ?? "",
      stories: story ? [story] : [],
    }),
    [story],
  );

  const open = useCallback((nextStory: StoryJson) => {
    setStory(nextStory);
    setActiveTab("overview");
    setTavernSelectNodeId(undefined);

    void loadStoryById(nextStory.id)
      .then((loaded) => {
        if (!loaded) {
          return;
        }
        setStory(loaded.story);
        setStoryWorkspace(loaded.workspace);
      })
      .catch((error) => {
        console.error("Failed to load story workspace", error);
        setStoryWorkspace(null);
      });
  }, []);

  const resolveStoryWorkspace = useCallback(
    async (storyId: string) => {
      if (storyWorkspace?.id === storyId) {
        return storyWorkspace;
      }

      const loaded = await loadStoryById(storyId);
      if (!loaded) {
        return null;
      }
      setStoryWorkspace(loaded.workspace);
      return loaded.workspace;
    },
    [storyWorkspace],
  );

  const saveStory = useCallback(
    async (nextStory: StoryJson) => {
      const workspace = await resolveStoryWorkspace(nextStory.id);
      if (!workspace) {
        toast.error("找不到故事工作区，无法保存。");
        return null;
      }

      setIsSaving(true);
      try {
        const savedStory = await saveStoryJson(workspace, {
          ...nextStory,
          workspaceId: workspace.id,
          updatedAt: Date.now(),
        });
        if (workspace.name !== savedStory.title) {
          const updatedRecord = await updateStoryRecordName(savedStory.id, savedStory.title);
          setStoryWorkspace({
            id: updatedRecord.id,
            name: updatedRecord.name,
            path: updatedRecord.workspacePath,
          });
        }
        setStory(savedStory);
        return savedStory;
      } catch (error) {
        console.error("Failed to save story", error);
        toast.error("故事保存失败。");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [resolveStoryWorkspace],
  );

  const persistStoryState = useCallback(
    async (nextState: StoryState) => {
      const nextStory =
        nextState.stories.find((item) => item.id === nextState.activeStoryId) ?? nextState.stories[0] ?? null;
      if (nextStory) {
        await saveStory(nextStory);
      }
    },
    [saveStory],
  );

  const openStoryPresentation = useCallback(
    (channel: StoryPresentationChannel, nodeId?: string | null) => {
      if (channel === "tavern") {
        setTavernSelectNodeId(nodeId ?? null);
        return;
      }

      if (!story) {
        return;
      }

      return openRegisteredStoryPresentation(channel, {
        workspace: tavernWorkspace,
        storyWorkspace,
        activeStory: story,
        storyState,
        persistStoryState,
        navigate,
        nodeId,
        setOpeningStoryId,
      });
    },
    [navigate, persistStoryState, story, storyState, storyWorkspace, tavernWorkspace],
  );

  const saveOverviewDraft = useCallback(
    (draft: StoryDraft) => {
      if (!story) {
        return;
      }

      void saveStory({
        ...story,
        title: draft.title.trim() || story.title,
        outline: draft.outline,
        goal: draft.goal,
        userPersonaName: draft.userPersonaName.trim() || "我",
      });
    },
    [saveStory, story],
  );

  const manuscriptActions = useStoryManuscripts({
    activeStory: story,
    persistStory: (nextStory) => void saveStory(nextStory),
    runtimeAgentRequiresModel,
    selectedRuntimeModel,
    settingsError,
    workspace: storyWorkspace,
  });

  return {
    activeTab,
    isSaving,
    manuscriptActions,
    open,
    openStoryPresentation,
    openingStoryId,
    saveOverviewDraft,
    saveStory,
    setActiveTab,
    setTavernSelectNodeId,
    story,
    storyState,
    storyWorkspace,
    tavernSelectNodeId,
    tavernWorkspace,
  };
};
