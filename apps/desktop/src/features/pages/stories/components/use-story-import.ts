import { useState } from "react";
import { toast } from "sonner";
import type { Workspace } from "@/features/pages/workspace/types";
import {
  assertStoryImportDraftReady,
  createStoryAssetFromImportDraft,
  createStoryImportDraftFromText,
  mergeStoryImportDraftIntoStory,
  type StoryAsset,
  type StoryImportDraft,
  type StoryImportSourceKind,
} from "@/features/story";
import type { StoryConfigTab } from "./story-tabs";

type UseStoryImportInput = {
  activeStory: StoryAsset | null;
  createStory: (input: { name: string; workspacePath: string }) => Promise<StoryAsset | null>;
  persistStory: (story: StoryAsset) => void;
  setActiveTab: (tab: StoryConfigTab) => void;
  workspace: Workspace | null;
};

export const useStoryImport = ({
  activeStory,
  createStory,
  persistStory,
  setActiveTab,
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
      setImportDraft(
        createStoryImportDraftFromText(importRaw, {
          sourceKind: importSourceKind,
        }),
      );
      toast.success("已转换为标准故事草稿。");
    } catch (error) {
      console.error("Failed to convert story import draft", error);
      toast.error(error instanceof Error ? error.message : "导入转换失败。");
    }
  };

  const importAsNewStory = async () => {
    if (!importDraft) {
      return;
    }

    try {
      assertStoryImportDraftReady(importDraft);
      const storyName = importDraft.story.title.trim() || importDraft.label.trim() || "导入故事";
      const suggestedPath = workspace
        ? `${workspace.path.replace(/\/$/, "")}/${storyName.replace(/[\\/:*?"<>|]+/g, "-")}`
        : "";
      const workspacePath = window.prompt("请输入这个新故事的工作区路径：", suggestedPath)?.trim();
      if (!workspacePath) {
        return;
      }

      const baseStory = await createStory({
        name: storyName,
        workspacePath,
      });
      if (!baseStory) {
        return;
      }

      const importedStory = createStoryAssetFromImportDraft({
        workspaceId: baseStory.id,
        draft: importDraft,
      });
      persistStory({
        ...importedStory,
        id: baseStory.id,
        workspaceId: baseStory.id,
        createdAt: baseStory.createdAt,
        updatedAt: Date.now(),
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
