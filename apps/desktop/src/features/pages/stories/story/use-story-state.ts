import { toast } from "sonner";
import { create } from "zustand";
import type { StoryJson } from "./model/types";
import {
  loadStoryById,
  saveStoryJson,
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
  getTavernWorkspacePath: (nodeId: string, roomId: string) => string;
  isSaving: boolean;
  closeStory: () => void;
  openStory: (item: StoryLibraryItem) => void;
  saveStory: (story: StoryJson) => Promise<StoryJson | null>;
  story: StoryJson | null;
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
  storyWorkspace: null,

  closeStory: () => {
    set({
      story: null,
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

  getTavernWorkspacePath: (nodeId, roomId) => {
    const { story, storyWorkspace } = get();
    if (!story || !storyWorkspace) {
      return "";
    }

    return [
      trimPathEnd(storyWorkspace.path),
      ".tavern",
      safePathSegment(story.id, "story"),
      safePathSegment(nodeId, "node"),
      safePathSegment(roomId, "room"),
    ].join("/");
  },

  openStory: (item) => {
    set({
      story: item.story,
      storyWorkspace: item.workspace,
    });
  },

  saveStory: async (nextStory) => {
    const workspace = await resolveStoryWorkspace(nextStory.id, get().storyWorkspace);
    if (!workspace) {
      toast.error("找不到故事工作区，无法保存。");
      return null;
    }

    set({ isSaving: true });
    try {
      const savedStory = await saveStoryJson(workspace, {
        ...nextStory,
        updatedAt: Date.now(),
      });
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
