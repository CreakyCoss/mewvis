import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createEmptyStoryState, upsertStoryJson, type StoryJson, type StoryState } from "@/features/story";
import {
  createStory as createStoryInWorkspace,
  deleteStoryRecord,
  loadStoryLibrary,
  saveStoryJson,
  updateStoryRecordName,
  type CreateStoryInput,
  type StoryRecord,
  type StoryWorkspace,
} from "@/features/story/storage";

type UseStoryStateInput = {
  requestedStoryId: string;
};

export const useStoryState = ({ requestedStoryId }: UseStoryStateInput) => {
  const [storyState, setStoryState] = useState<StoryState>(() => createEmptyStoryState());
  const [storyRecords, setStoryRecords] = useState<StoryRecord[]>([]);
  const [storyWorkspacesById, setStoryWorkspacesById] = useState<Record<string, StoryWorkspace>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeStory = useMemo(
    () => storyState.stories.find((story) => story.id === storyState.activeStoryId) ?? storyState.stories[0] ?? null,
    [storyState.activeStoryId, storyState.stories],
  );
  const activeStoryWorkspace = activeStory ? (storyWorkspacesById[activeStory.id] ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadStoryLibrary(requestedStoryId)
      .then(({ records, state, workspacesByStoryId }) => {
        if (cancelled) {
          return;
        }
        setStoryRecords(records);
        setStoryWorkspacesById(workspacesByStoryId);
        setStoryState(state);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("Failed to load story library", error);
        toast.error("无法加载故事。");
        setStoryRecords([]);
        setStoryWorkspacesById({});
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
  }, [requestedStoryId]);

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

  const persistStory = async (story: StoryJson) => {
    const workspace = storyWorkspacesById[story.id];
    if (!workspace) {
      toast.error("找不到故事工作区，无法保存。");
      return;
    }

    setIsSaving(true);
    try {
      const nextStory = {
        ...story,
        workspaceId: story.id,
        updatedAt: Date.now(),
      };
      const savedStory = await saveStoryJson(workspace, nextStory);
      if (workspace.name !== savedStory.title) {
        const updatedRecord = await updateStoryRecordName(savedStory.id, savedStory.title);
        setStoryRecords((current) =>
          current.map((record) => (record.id === updatedRecord.id ? updatedRecord : record)),
        );
        setStoryWorkspacesById((current) => ({
          ...current,
          [updatedRecord.id]: {
            id: updatedRecord.id,
            name: updatedRecord.name,
            path: updatedRecord.workspacePath,
          },
        }));
      }
      setStoryState((current) => ({
        ...upsertStoryJson(current, savedStory),
        activeStoryId: savedStory.id,
      }));
    } catch (error) {
      console.error("Failed to save story", error);
      toast.error("故事保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const persistStoryState = async (nextState: StoryState) => {
    setIsSaving(true);
    try {
      const savedStories: StoryJson[] = [];
      for (const story of nextState.stories) {
        const workspace = storyWorkspacesById[story.id];
        if (!workspace) {
          savedStories.push(story);
          continue;
        }
        savedStories.push(
          await saveStoryJson(workspace, {
            ...story,
            workspaceId: story.id,
            updatedAt: Date.now(),
          }),
        );
      }

      setStoryState({
        version: 1,
        activeStoryId: savedStories.some((story) => story.id === nextState.activeStoryId)
          ? nextState.activeStoryId
          : (savedStories[0]?.id ?? ""),
        stories: savedStories,
      });
    } catch (error) {
      console.error("Failed to save story state", error);
      toast.error("故事保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const selectStory = (story: StoryJson) => {
    setStoryState((current) => ({
      ...current,
      activeStoryId: story.id,
    }));
  };

  const createStory = async (input: CreateStoryInput) => {
    setIsSaving(true);
    try {
      const { record, workspace, story } = await createStoryInWorkspace(input);
      setStoryRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      setStoryWorkspacesById((current) => ({
        ...current,
        [story.id]: workspace,
      }));
      setStoryState((current) => ({
        ...upsertStoryJson(
          {
            ...current,
            activeStoryId: story.id,
          },
          story,
        ),
        activeStoryId: story.id,
      }));
      toast.success("故事已创建。");
      return story;
    } catch (error) {
      console.error("Failed to create story", error);
      toast.error(error instanceof Error ? error.message : "故事创建失败。");
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteStory = async (story: StoryJson) => {
    setIsSaving(true);
    try {
      await deleteStoryRecord(story.id);
      setStoryRecords((current) => current.filter((record) => record.id !== story.id));
      setStoryWorkspacesById((current) => {
        const next = { ...current };
        delete next[story.id];
        return next;
      });
      setStoryState((current) => {
        const stories = current.stories.filter((item) => item.id !== story.id);
        return {
          version: 1,
          activeStoryId: current.activeStoryId === story.id ? (stories[0]?.id ?? "") : current.activeStoryId,
          stories,
        };
      });
      toast.success("故事及工作区已删除。");
    } catch (error) {
      console.error("Failed to delete story", error);
      toast.error(error instanceof Error ? error.message : "故事删除失败。");
    } finally {
      setIsSaving(false);
    }
  };

  return {
    activeStory,
    activeStoryWorkspace,
    createStory,
    deleteStory,
    isLoading,
    isSaving,
    persistStory,
    persistStoryState,
    selectStory,
    storyRecords,
    storyState,
    storyWorkspacesById,
  };
};
