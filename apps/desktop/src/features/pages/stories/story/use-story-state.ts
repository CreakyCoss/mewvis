import { toast } from "sonner";
import { create } from "zustand";
import {
  storyJsonToProject,
  storyProjectToStoryJson,
  type StoryProject,
  type StoryValidationProfile,
} from "../story-contract";
import type { StoryJson } from "./model/types";
import {
  loadStoryById,
  saveStoryProject,
  updateStoryRecordName,
  type StoryLibraryItem,
  type StoryWorkspace,
} from "../storage";

export type StoryNodeSelectOption = {
  description?: string;
  id: string;
  label: string;
  meta?: string;
};

type StoryStore = {
  buildNodeOptions: (story: StoryJson | null) => StoryNodeSelectOption[];
  getChatWorkspacePath: (chatWorkspaceId: string) => string;
  getTavernWorkspacePath: (nodeId: string) => string;
  isSaving: boolean;
  closeStory: () => void;
  openStory: (item: StoryLibraryItem) => void;
  saveProject: (project: StoryProject, profile?: StoryValidationProfile) => Promise<StoryProject | null>;
  saveStory: (story: StoryJson) => Promise<StoryJson | null>;
  story: StoryJson | null;
  storyProject: StoryProject | null;
  storyWorkspace: StoryWorkspace | null;
};

const trimPathEnd = (value: string) => value.trim().replace(/[\\/]+$/, "");

const safePathSegment = (value: string, fallback: string) =>
  value.trim().replace(/[\\/]/g, "-").replace(/\.\./g, "").replace(/^\.+/, "").trim() || fallback;

const resolveStoryWorkspace = async (storyId: string, storyWorkspace: StoryWorkspace | null) => {
  if (storyWorkspace?.id === storyId) {
    return storyWorkspace;
  }

  const loaded = await loadStoryById(storyId);
  return loaded?.workspace ?? null;
};

export const useStoryState = create<StoryStore>((set, get) => ({
  isSaving: false,
  story: null,
  storyProject: null,
  storyWorkspace: null,

  closeStory: () => {
    set({
      story: null,
      storyProject: null,
      storyWorkspace: null,
    });
  },

  buildNodeOptions: (story) => {
    if (!story) {
      return [];
    }

    return story.graph.nodes.map((node) => {
      const scene = node.sceneId ? (story.scenes.find((item) => item.id === node.sceneId) ?? null) : null;
      return {
        id: node.id,
        label: node.title.trim() || node.id,
        meta: node.pathRole === "main" ? "主线" : "支线",
        description: scene?.title || scene?.plot || scene?.scene || node.status || "",
      };
    });
  },

  getChatWorkspacePath: (chatWorkspaceId) => `/chat/${chatWorkspaceId}/new`,

  getTavernWorkspacePath: (nodeId) => {
    const { story, storyWorkspace } = get();
    if (!story || !storyWorkspace) {
      return "";
    }

    return [
      trimPathEnd(storyWorkspace.path),
      ".tavern",
      safePathSegment(story.id, "story"),
      safePathSegment(nodeId, "node"),
    ].join("/");
  },

  openStory: (item) => {
    set({
      story: item.story,
      storyProject: item.project,
      storyWorkspace: item.workspace,
    });
  },

  saveProject: async (nextProject, profile = "draft") => {
    const workspace = await resolveStoryWorkspace(nextProject.manifest.storyId, get().storyWorkspace);
    if (!workspace) {
      toast.error("找不到故事工作区，无法保存。");
      return null;
    }

    set({ isSaving: true });
    try {
      const savedProject = await saveStoryProject(workspace, nextProject, profile);
      const savedStory = storyProjectToStoryJson(savedProject);
      let nextWorkspace = workspace;
      if (workspace.name !== savedStory.title) {
        const updatedRecord = await updateStoryRecordName(savedStory.id, savedStory.title);
        nextWorkspace = {
          id: updatedRecord.id,
          name: updatedRecord.name,
          path: updatedRecord.workspacePath,
        };
      }
      set({
        story: savedStory,
        storyProject: savedProject,
        storyWorkspace: nextWorkspace,
      });
      return savedProject;
    } catch (error) {
      console.error("Failed to save story project", error);
      toast.error(error instanceof Error ? error.message : "故事保存失败。");
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  saveStory: async (nextStory) => {
    const workspace = await resolveStoryWorkspace(nextStory.id, get().storyWorkspace);
    if (!workspace) {
      toast.error("找不到故事工作区，无法保存。");
      return null;
    }

    set({ isSaving: true });
    try {
      const loaded = get().storyProject ?? (await loadStoryById(nextStory.id))?.project ?? null;
      if (!loaded) {
        throw new Error("故事结构尚未加载。");
      }
      const nextProject = storyJsonToProject(
        {
          ...nextStory,
          updatedAt: Date.now(),
        },
        loaded,
      );
      const savedProject = await saveStoryProject(workspace, nextProject, "draft");
      const savedStory = storyProjectToStoryJson(savedProject);
      let nextWorkspace = workspace;
      if (workspace.name !== savedStory.title) {
        const updatedRecord = await updateStoryRecordName(savedStory.id, savedStory.title);
        nextWorkspace = {
          id: updatedRecord.id,
          name: updatedRecord.name,
          path: updatedRecord.workspacePath,
        };
      }
      set({
        story: savedStory,
        storyProject: savedProject,
        storyWorkspace: nextWorkspace,
      });
      return savedStory;
    } catch (error) {
      console.error("Failed to save story", error);
      toast.error("故事保存失败。");
      return null;
    } finally {
      set({ isSaving: false });
    }
  },
}));
