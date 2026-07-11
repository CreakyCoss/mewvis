import { toast } from "sonner";
import { create } from "zustand";
import { storyDocumentsToStoryJson } from "../documents/model";
import { removeStoryDocument, saveStoryDocument } from "../documents/repository";
import type { JsonValue, StoryJsonDocument } from "../documents/types";
import type { StoryJson } from "./model/types";
import { loadStoryById, updateStoryRecordName, type StoryLibraryItem, type StoryWorkspace } from "../storage";

export type StoryNodeSelectOption = {
  description?: string;
  id: string;
  label: string;
  meta?: string;
};

type StoryStore = {
  buildNodeOptions: (story: StoryJson | null) => StoryNodeSelectOption[];
  closeStory: () => void;
  createDocument: (path: string, value: JsonValue) => Promise<StoryJsonDocument | null>;
  deleteDocument: (path: string) => Promise<boolean>;
  documents: StoryJsonDocument[];
  getChatWorkspacePath: (chatWorkspaceId: string) => string;
  getTavernWorkspacePath: (nodeId: string) => string;
  isSaving: boolean;
  openStory: (item: StoryLibraryItem) => void;
  reloadStory: () => Promise<StoryLibraryItem | null>;
  saveDocument: (document: StoryJsonDocument) => Promise<StoryJsonDocument | null>;
  story: StoryJson | null;
  storyWorkspace: StoryWorkspace | null;
};

const trimPathEnd = (value: string) => value.trim().replace(/[\\/]+$/, "");

const safePathSegment = (value: string, fallback: string) =>
  value.trim().replace(/[\\/]/g, "-").replace(/\.\./g, "").replace(/^\.+/, "").trim() || fallback;

const nextStoryView = (story: StoryJson, workspace: StoryWorkspace, documents: StoryJsonDocument[]) =>
  storyDocumentsToStoryJson(
    {
      id: story.id,
      name: workspace.name,
      createdAt: story.createdAt,
      updatedAt: Date.now(),
    },
    documents,
  );

const replaceDocument = (documents: StoryJsonDocument[], document: StoryJsonDocument) =>
  [...documents.filter((item) => item.path !== document.path), document].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

export const useStoryState = create<StoryStore>((set, get) => ({
  documents: [],
  isSaving: false,
  story: null,
  storyWorkspace: null,

  closeStory: () => {
    set({ documents: [], story: null, storyWorkspace: null });
  },

  buildNodeOptions: (story) => {
    if (!story) return [];
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
    if (!story || !storyWorkspace) return "";
    return [
      trimPathEnd(storyWorkspace.path),
      ".tavern",
      safePathSegment(story.id, "story"),
      safePathSegment(nodeId, "node"),
    ].join("/");
  },

  openStory: (item) => {
    set({ documents: item.documents, story: item.story, storyWorkspace: item.workspace });
  },

  reloadStory: async () => {
    const storyId = get().story?.id;
    if (!storyId) return null;
    const loaded = await loadStoryById(storyId);
    if (loaded) get().openStory(loaded);
    return loaded;
  },

  saveDocument: async (document) => {
    const { documents, story, storyWorkspace } = get();
    if (!story || !storyWorkspace) {
      toast.error("找不到故事工作区，无法保存。");
      return null;
    }
    set({ isSaving: true });
    try {
      const saved = await saveStoryDocument(storyWorkspace.path, document);
      const nextDocuments = replaceDocument(documents, saved);
      const nextStory = nextStoryView(story, storyWorkspace, nextDocuments);
      let nextWorkspace = storyWorkspace;
      if (nextStory.title && nextStory.title !== storyWorkspace.name) {
        const record = await updateStoryRecordName(story.id, nextStory.title);
        nextWorkspace = { id: record.id, name: record.name, path: record.workspacePath };
      }
      set({ documents: nextDocuments, story: nextStory, storyWorkspace: nextWorkspace });
      return saved;
    } catch (error) {
      console.error("Failed to save story JSON document", error);
      toast.error(error instanceof Error ? error.message : "JSON 保存失败。");
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  createDocument: async (path, value) => {
    if (get().documents.some((document) => document.path === path)) {
      toast.error("同路径 JSON 文件已经存在。");
      return null;
    }
    return get().saveDocument({ path, value, updatedAt: null });
  },

  deleteDocument: async (path) => {
    const { documents, story, storyWorkspace } = get();
    if (!story || !storyWorkspace) return false;
    set({ isSaving: true });
    try {
      await removeStoryDocument(storyWorkspace.path, path);
      const nextDocuments = documents.filter((document) => document.path !== path);
      set({ documents: nextDocuments, story: nextStoryView(story, storyWorkspace, nextDocuments) });
      return true;
    } catch (error) {
      console.error("Failed to delete story JSON document", error);
      toast.error(error instanceof Error ? error.message : "JSON 删除失败。");
      return false;
    } finally {
      set({ isSaving: false });
    }
  },
}));
