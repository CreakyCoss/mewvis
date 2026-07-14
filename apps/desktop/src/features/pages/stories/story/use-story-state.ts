import { toast } from "sonner";
import { create } from "zustand";
import {
  StoryProjects,
  type JsonValue,
  type StoryProjectDocument,
  type StoryProjectOverview,
} from "../../../../../core/story-project";
import { loadStoryById, updateStoryRecordName, type StoryLibraryItem, type StoryWorkspace } from "../storage";

type StoryStore = {
  closeStory: () => void;
  createDocument: (path: string, value: JsonValue) => Promise<StoryProjectDocument | null>;
  deleteDocument: (path: string) => Promise<boolean>;
  documents: StoryProjectDocument[];
  getChatWorkspacePath: (chatWorkspaceId: string) => string;
  isSaving: boolean;
  openStory: (item: StoryLibraryItem) => void;
  overview: StoryProjectOverview | null;
  reloadStory: () => Promise<StoryLibraryItem | null>;
  saveDocument: (document: StoryProjectDocument) => Promise<StoryProjectDocument | null>;
  storyWorkspace: StoryWorkspace | null;
};

const replaceDocument = (documents: StoryProjectDocument[], document: StoryProjectDocument) =>
  [...documents.filter((item) => item.path !== document.path), document].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

export const useStoryState = create<StoryStore>((set, get) => ({
  documents: [],
  isSaving: false,
  overview: null,
  storyWorkspace: null,

  closeStory: () => {
    set({ documents: [], overview: null, storyWorkspace: null });
  },

  getChatWorkspacePath: (chatWorkspaceId) => `/chat/${chatWorkspaceId}/new`,

  openStory: (item) => {
    set({ documents: item.documents, overview: item.overview, storyWorkspace: item.workspace });
  },

  reloadStory: async () => {
    const storyId = get().overview?.id;
    if (!storyId) return null;
    const loaded = await loadStoryById(storyId);
    if (loaded) get().openStory(loaded);
    return loaded;
  },

  saveDocument: async (document) => {
    const { documents, overview, storyWorkspace } = get();
    if (!overview || !storyWorkspace) {
      toast.error("找不到故事工作区，无法保存。");
      return null;
    }
    set({ isSaving: true });
    try {
      const project = await StoryProjects.open(storyWorkspace.path);
      const saved = await project.saveDocument(document);
      const nextDocuments = replaceDocument(documents, saved);
      const nextOverview = await project.overview();
      let nextWorkspace = storyWorkspace;
      if (nextOverview.title && nextOverview.title !== storyWorkspace.name) {
        const record = await updateStoryRecordName(overview.id, nextOverview.title);
        nextWorkspace = { id: record.id, name: record.name, path: record.workspacePath };
      }
      set({ documents: nextDocuments, overview: nextOverview, storyWorkspace: nextWorkspace });
      return saved;
    } catch (error) {
      console.error("Failed to save story document", error);
      toast.error(error instanceof Error ? error.message : "故事资料保存失败。");
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
    const { documents, overview, storyWorkspace } = get();
    if (!overview || !storyWorkspace) return false;
    set({ isSaving: true });
    try {
      const project = await StoryProjects.open(storyWorkspace.path);
      await project.removeDocument(path);
      const nextDocuments = documents.filter((document) => document.path !== path);
      set({ documents: nextDocuments, overview: await project.overview() });
      return true;
    } catch (error) {
      console.error("Failed to delete story document", error);
      toast.error(error instanceof Error ? error.message : "故事资料删除失败。");
      return false;
    } finally {
      set({ isSaving: false });
    }
  },
}));
