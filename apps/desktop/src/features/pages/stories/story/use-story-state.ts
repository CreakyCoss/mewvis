import { toast } from "sonner";
import { create } from "zustand";
import type {
  StoryDocument,
  StoryDocumentIdentity,
  StoryOverview,
  StoryValue,
} from "../../../../../core/story-project/types";
import { storyProjectApi } from "../project-client";
import { loadStoryById, updateStoryRecordName, type StoryLibraryItem, type StoryWorkspace } from "../storage";
import { storyDocumentKey } from "../story-document";

type StoryStore = {
  closeStory: () => void;
  createDocument: (ref: StoryDocumentIdentity, value: StoryValue) => Promise<StoryDocument | null>;
  deleteDocument: (ref: StoryDocumentIdentity) => Promise<boolean>;
  documents: StoryDocument[];
  getChatWorkspacePath: (chatWorkspaceId: string) => string;
  isSaving: boolean;
  openStory: (item: StoryLibraryItem) => void;
  overview: StoryOverview | null;
  reloadStory: () => Promise<StoryLibraryItem | null>;
  saveDocument: (document: StoryDocument) => Promise<StoryDocument | null>;
  storyWorkspace: StoryWorkspace | null;
};

const replaceDocument = (documents: StoryDocument[], document: StoryDocument) =>
  [...documents.filter((item) => storyDocumentKey(item) !== storyDocumentKey(document)), document].sort((left, right) =>
    storyDocumentKey(left).localeCompare(storyDocumentKey(right)),
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
      const project = await storyProjectApi.open(storyWorkspace.path);
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

  createDocument: async (ref, value) => {
    if (get().documents.some((document) => storyDocumentKey(document) === storyDocumentKey({ ref }))) {
      toast.error("相同引用的故事文档已经存在。");
      return null;
    }
    return get().saveDocument({ ref, value, updatedAt: null });
  },

  deleteDocument: async (ref) => {
    const { documents, overview, storyWorkspace } = get();
    if (!overview || !storyWorkspace) return false;
    set({ isSaving: true });
    try {
      const project = await storyProjectApi.open(storyWorkspace.path);
      await project.removeDocument(ref);
      const key = storyDocumentKey({ ref });
      const nextDocuments = documents.filter((document) => storyDocumentKey(document) !== key);
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
