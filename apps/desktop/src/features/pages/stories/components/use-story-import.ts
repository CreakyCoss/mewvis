import { useState } from "react";
import { toast } from "sonner";
import type { Workspace } from "@/features/pages/workspace/types";
import {
  assertStoryImportDraftReady,
  createStoryAssetFromImportDraft,
  createStoryImportDraftFromText,
  mergeStoryImportDraftIntoStory,
  upsertStoryAsset,
  type StoryAsset,
  type StoryImportDraft,
  type StoryImportSourceKind,
  type StoryState,
} from "@/features/story";
import type { StoryConfigTab } from "./shared";

type UseStoryImportInput = {
  activeStory: StoryAsset | null;
  persistStory: (story: StoryAsset) => void;
  persistStoryState: (nextState: StoryState) => Promise<void>;
  setActiveTab: (tab: StoryConfigTab) => void;
  storyState: StoryState;
  workspace: Workspace | null;
};

export const useStoryImport = ({
  activeStory,
  persistStory,
  persistStoryState,
  setActiveTab,
  storyState,
  workspace,
}: UseStoryImportInput) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importSourceKind, setImportSourceKind] = useState<StoryImportSourceKind>("unknown");
  const [importRaw, setImportRaw] = useState("");
  const [importDraft, setImportDraft] = useState<StoryImportDraft | null>(null);

  const openImportDialog = () => {
    setImportRaw("");
    setImportDraft(null);
    setImportSourceKind("unknown");
    setIsImportOpen(true);
  };

  const convertImportDraft = () => {
    try {
      setImportDraft(createStoryImportDraftFromText(importRaw, {
        sourceKind: importSourceKind,
      }));
      toast.success("已转换为标准故事草稿。");
    } catch (error) {
      console.error("Failed to convert story import draft", error);
      toast.error(error instanceof Error ? error.message : "导入转换失败。");
    }
  };

  const importAsNewStory = () => {
    if (!workspace || !importDraft) {
      return;
    }

    try {
      assertStoryImportDraftReady(importDraft);
      const story = createStoryAssetFromImportDraft({
        workspaceId: workspace.id,
        draft: importDraft,
      });
      void persistStoryState({
        ...upsertStoryAsset({
          ...storyState,
          activeStoryId: story.id,
        }, story),
        activeStoryId: story.id,
      });
      setActiveTab("overview");
      setIsImportOpen(false);
      toast.success("故事已导入。");
    } catch (error) {
      console.error("Failed to import story", error);
      toast.error(error instanceof Error ? error.message : "故事导入失败。");
    }
  };

  const mergeImportIntoActiveStory = () => {
    if (!activeStory || !importDraft) {
      return;
    }

    try {
      assertStoryImportDraftReady(importDraft);
      const updatedStory = mergeStoryImportDraftIntoStory(activeStory, importDraft);
      persistStory(updatedStory);
      setActiveTab(importDraft.mode === "lorebookPatch" ? "world" : "overview");
      setIsImportOpen(false);
      toast.success("导入内容已合并。");
    } catch (error) {
      console.error("Failed to merge story import", error);
      toast.error(error instanceof Error ? error.message : "导入合并失败。");
    }
  };

  return {
    convertImportDraft,
    importAsNewStory,
    importDraft,
    importRaw,
    importSourceKind,
    isImportOpen,
    mergeImportIntoActiveStory,
    openImportDialog,
    setImportDraft,
    setImportRaw,
    setImportSourceKind,
    setIsImportOpen,
  };
};
