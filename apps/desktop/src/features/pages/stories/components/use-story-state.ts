import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createEmptyStoryState,
  createStandaloneStoryAsset,
  upsertStoryAsset,
  type StoryAsset,
  type StoryState,
} from "@/features/story";
import { loadStoryState, saveStoryState } from "@/features/story/storage";
import type { Workspace } from "@/features/pages/workspace/types";

type UseStoryStateInput = {
  workspace: Workspace | null;
  requestedStoryId: string;
};

export const useStoryState = ({
  workspace,
  requestedStoryId,
}: UseStoryStateInput) => {
  const [storyState, setStoryState] = useState<StoryState>(() => createEmptyStoryState());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeStory = useMemo(
    () => storyState.stories.find((story) => story.id === storyState.activeStoryId) ??
      storyState.stories[0] ??
      null,
    [storyState.activeStoryId, storyState.stories],
  );

  useEffect(() => {
    if (!workspace) {
      setStoryState(createEmptyStoryState());
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    loadStoryState(workspace.path, workspace.id)
      .then((nextState) => {
        if (cancelled) {
          return;
        }
        const requestedStory = requestedStoryId
          ? nextState.stories.find((story) => story.id === requestedStoryId) ?? null
          : null;
        const selectedStory = requestedStory ??
          nextState.stories.find((story) => story.id === nextState.activeStoryId) ??
          nextState.stories[0] ??
          null;
        setStoryState({
          ...nextState,
          activeStoryId: selectedStory?.id ?? nextState.activeStoryId,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("Failed to load story state", error);
        toast.error("无法加载故事资产。");
        setStoryState(createEmptyStoryState());
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestedStoryId, workspace]);

  useEffect(() => {
    if (!requestedStoryId || storyState.activeStoryId === requestedStoryId) {
      return;
    }
    const requestedStory = storyState.stories.find((story) => story.id === requestedStoryId);
    if (requestedStory) {
      setStoryState((current) => ({
        ...current,
        activeStoryId: requestedStory.id,
      }));
    }
  }, [requestedStoryId, storyState.activeStoryId, storyState.stories]);

  const persistStoryState = async (nextState: StoryState) => {
    if (!workspace) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveStoryState(workspace.path, workspace.id, nextState);
      setStoryState(saved);
    } catch (error) {
      console.error("Failed to save story state", error);
      toast.error("故事保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const persistStory = (story: StoryAsset) => {
    void persistStoryState(upsertStoryAsset(storyState, {
      ...story,
      updatedAt: Date.now(),
    }));
  };

  const selectStory = (story: StoryAsset) => {
    setStoryState((current) => ({
      ...current,
      activeStoryId: story.id,
    }));
  };

  const createStory = () => {
    if (!workspace) {
      return;
    }

    const story = createStandaloneStoryAsset({
      workspaceId: workspace.id,
      title: `新故事 ${storyState.stories.length + 1}`,
    });
    void persistStoryState({
      ...upsertStoryAsset({
        ...storyState,
        activeStoryId: story.id,
      }, story),
      activeStoryId: story.id,
    });
  };

  return {
    activeStory,
    createStory,
    isLoading,
    isSaving,
    persistStory,
    persistStoryState,
    selectStory,
    storyState,
  };
};
