import { toast } from "sonner";
import { create } from "zustand";
import type { StoryJson } from "@/features/story/model/story-types";
import {
  loadStoryById,
  saveStoryJson,
  updateStoryRecordName,
  type StoryWorkspace,
} from "@/features/story/persistence/story-storage";
import type { StoryNodeSelectOption } from "./actions/node";

export type StoryModulesHandle = (story: StoryJson) => void;

type StoryStateStore = {
  buildNodeOptions: (story: StoryJson | null) => StoryNodeSelectOption[];
  getChatWorkspacePath: (workspaceId: string) => string;
  getTavernWorkspacePath: (nodeId: string) => string;
  isSaving: boolean;
  openStory: StoryModulesHandle;
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

export const useStoryState = create<StoryStateStore>((set, get) => ({
  isSaving: false,
  story: null,
  storyWorkspace: null,

  buildNodeOptions: (story) => {
    if (!story) {
      return [];
    }

    return story.graph.nodes.map((node) => {
      const scene = node.sceneId ? (story.scenes.find((item) => item.id === node.sceneId) ?? null) : null;
      return {
        id: node.id,
        label: node.title.trim() || node.id,
        meta: [
          node.id === story.graph.entryNodeId ? "入口" : "",
          node.id === story.graph.activeNodeId ? "当前" : "",
          node.pathRole === "main" ? "主线" : "支线",
        ]
          .filter(Boolean)
          .join(" · "),
        description: scene?.title || scene?.plot || scene?.scene || node.status || "",
      };
    });
  },

  getChatWorkspacePath: (workspaceId) => `/chat/${workspaceId}/new`,

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

  openStory: (nextStory) => {
    set({
      story: nextStory,
      storyWorkspace: null,
    });

    void loadStoryById(nextStory.id)
      .then((loaded) => {
        if (!loaded) {
          return;
        }
        if (get().story?.id !== nextStory.id) {
          return;
        }
        set({
          story: loaded.story,
          storyWorkspace: loaded.workspace,
        });
      })
      .catch((error) => {
        console.error("Failed to load story workspace", error);
        set({ storyWorkspace: null });
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
        workspaceId: workspace.id,
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
