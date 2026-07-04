import { useState } from "react";
import { toast } from "sonner";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import { normalizeStoryJson } from "@/features/story/model/story-normalizer";
import {
  convertStorySourceToStoryJson,
  parseStoryJsonFromText,
} from "@/features/story/importing/story-import-converter";
import type { StoryJson } from "@/features/story/model/story-types";
import type { StoryConfigTab } from "./story-tabs";

type UseStoryImportInput = {
  activeStory: StoryJson | null;
  createStory: (input: { name: string; workspacePath: string }) => Promise<StoryJson | null>;
  persistStory: (story: StoryJson) => void | Promise<unknown>;
  selectedRuntimeModel: RuntimeModelOption | null;
  setActiveTab: (tab: StoryConfigTab) => void;
  settingsError: string;
  workspace: Workspace | null;
};

const dedupeById = <T extends { id: string }>(items: T[]) => [
  ...new Map(items.map((item) => [item.id, item] as const)).values(),
];

const mergeStoryJsonIntoStory = (story: StoryJson, incoming: StoryJson): StoryJson => ({
  ...story,
  title: incoming.title.trim() || story.title,
  outline: incoming.outline.trim() || story.outline,
  goal: incoming.goal.trim() || story.goal,
  userPersonaName: incoming.userPersonaName.trim() || story.userPersonaName,
  characters: dedupeById([...story.characters, ...incoming.characters]),
  lorebookEntries: dedupeById([...story.lorebookEntries, ...incoming.lorebookEntries]),
  scenes: dedupeById([...story.scenes, ...incoming.scenes]),
  graph: {
    entryNodeId: story.graph.entryNodeId || incoming.graph.entryNodeId,
    activeNodeId: story.graph.activeNodeId || incoming.graph.activeNodeId,
    stages: dedupeById([...story.graph.stages, ...incoming.graph.stages]),
    nodes: dedupeById([...story.graph.nodes, ...incoming.graph.nodes]),
    edges: dedupeById([...story.graph.edges, ...incoming.graph.edges]),
  },
  updatedAt: Date.now(),
});

export const useStoryImport = ({
  activeStory,
  createStory,
  persistStory,
  selectedRuntimeModel,
  setActiveTab,
  settingsError,
  workspace,
}: UseStoryImportInput) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRaw, setImportRaw] = useState("");
  const [importStory, setImportStory] = useState<StoryJson | null>(null);
  const [isConvertingImport, setIsConvertingImport] = useState(false);

  const openImportDialog = () => {
    setImportRaw("");
    setImportStory(null);
    setIsImportOpen(true);
  };

  const requireImportRuntimeModel = () => {
    if (settingsError) {
      throw new Error(settingsError);
    }
    if (!selectedRuntimeModel) {
      throw new Error("非标准来源需要先在设置中选择模型，再由 AI 转换为标准 story.json。");
    }
    return requireRuntimeModelInput(selectedRuntimeModel);
  };

  const convertImportStory = async () => {
    if (!importRaw.trim()) {
      toast.error("请先粘贴或选择要导入的内容。");
      return;
    }

    setIsConvertingImport(true);
    try {
      const parsed = parseStoryJsonFromText(importRaw);
      const story =
        parsed ??
        (await convertStorySourceToStoryJson({
          source: importRaw,
          runtimeModel: requireImportRuntimeModel(),
        }));
      setImportStory(story);
      toast.success(parsed ? "已读取标准 story.json。" : "AI 已转换为标准 story.json。");
    } catch (error) {
      console.error("Failed to convert story import", error);
      toast.error(error instanceof Error ? error.message : "导入转换失败。");
    } finally {
      setIsConvertingImport(false);
    }
  };

  const importAsNewStory = async () => {
    if (!importStory) {
      return;
    }

    try {
      const storyName = importStory.title.trim() || "导入故事";
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

      const story = normalizeStoryJson(importStory, {
        id: baseStory.id,
        workspaceId: baseStory.id,
        title: storyName,
        timestamp: Date.now(),
      });
      if (!story) {
        throw new Error("导入内容不是有效的 story.json。");
      }

      await persistStory({
        ...story,
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

  const mergeImportIntoActiveStory = async () => {
    if (!activeStory) {
      return;
    }
    if (!importRaw.trim() && !importStory) {
      toast.error("请先粘贴或选择要合并的内容。");
      return;
    }

    setIsConvertingImport(true);
    try {
      const parsed =
        importStory ??
        parseStoryJsonFromText(importRaw, {
          storyId: activeStory.id,
          workspaceId: activeStory.workspaceId,
          title: activeStory.title,
        });
      const updatedStory = parsed
        ? mergeStoryJsonIntoStory(activeStory, parsed)
        : await convertStorySourceToStoryJson({
            source: importRaw,
            runtimeModel: requireImportRuntimeModel(),
            existingStory: activeStory,
            storyId: activeStory.id,
            workspaceId: activeStory.workspaceId,
            title: activeStory.title,
          });

      await persistStory({
        ...updatedStory,
        id: activeStory.id,
        workspaceId: activeStory.workspaceId,
        updatedAt: Date.now(),
      });
      setImportStory(updatedStory);
      setActiveTab("overview");
      setIsImportOpen(false);
      toast.success("导入内容已合并。");
    } catch (error) {
      console.error("Failed to merge story import", error);
      toast.error(error instanceof Error ? error.message : "导入合并失败。");
    } finally {
      setIsConvertingImport(false);
    }
  };

  return {
    convertImportStory,
    importAsNewStory,
    importRaw,
    importStory,
    isConvertingImport,
    isImportOpen,
    mergeImportIntoActiveStory,
    openImportDialog,
    setImportRaw,
    setImportStory,
    setIsImportOpen,
  };
};
