import { toast } from "sonner";
import { create } from "zustand";
import type {
  StoryDocument,
  StoryDocumentIdentity,
  StoryOverview,
  StoryProjectStructure,
  StoryValue,
} from "@story/project/types";
import { storyProjectApi } from "../project-client";
import {
  loadStoryById,
  updateStoryRecordName,
  type StoryLibraryItem,
  type StoryWorkspace,
} from "../storage";
import { storyDocumentKey } from "../story-document";
import { commitDocumentWrites } from "./workbench/persistence";

type StoryStore = {
  writeDocuments: (
    build: (
      documents: StoryDocument[],
      structure: StoryProjectStructure,
    ) => Pick<StoryDocument, "ref" | "value">[],
  ) => Promise<StoryDocument[] | null>;
  closeStory: () => void;
  createDocument: (
    ref: StoryDocumentIdentity,
    value: StoryValue,
  ) => Promise<StoryDocument | null>;
  deleteDocument: (ref: StoryDocumentIdentity) => Promise<boolean>;
  documentStructure: StoryProjectStructure | null;
  documents: StoryDocument[];
  isLoadingDocumentStructure: boolean;
  isSaving: boolean;
  loadDocumentStructure: () => Promise<StoryProjectStructure | null>;
  openStory: (item: StoryLibraryItem) => void;
  overview: StoryOverview | null;
  reloadStory: () => Promise<StoryLibraryItem | null>;
  saveDocument: (
    document: Pick<StoryDocument, "ref" | "value">,
  ) => Promise<StoryDocument | null>;
  storyWorkspace: StoryWorkspace | null;
};

let contentVersion = 0;
export const useStoryState = create<StoryStore>((set, get) => ({
  documents: [],
  documentStructure: null,
  isLoadingDocumentStructure: false,
  isSaving: false,
  overview: null,
  storyWorkspace: null,

  closeStory: () => {
    contentVersion++;
    set({
      documents: [],
      documentStructure: null,
      isLoadingDocumentStructure: false,
      isSaving: false,
      overview: null,
      storyWorkspace: null,
    });
  },

  openStory: (item) => {
    contentVersion++;
    const workspaceChanged = get().storyWorkspace?.path !== item.workspace.path;
    set({
      documents: item.documents,
      ...(workspaceChanged
        ? {
            documentStructure: null,
            isLoadingDocumentStructure: false,
            isSaving: false,
          }
        : {}),
      overview: item.overview,
      storyWorkspace: item.workspace,
    });
  },

  loadDocumentStructure: async () => {
    const current = get();
    if (current.documentStructure) return current.documentStructure;
    if (current.isLoadingDocumentStructure || !current.storyWorkspace)
      return null;

    const workspacePath = current.storyWorkspace.path;
    set({ isLoadingDocumentStructure: true });
    try {
      const project = await storyProjectApi.open(workspacePath);
      const summary = await project.describe();
      const structure = await project.describe({
        documentKinds: Object.keys(summary.documents),
      });
      if (get().storyWorkspace?.path === workspacePath) {
        set({ documentStructure: structure });
      }
      return structure;
    } catch (error) {
      console.error("Failed to load story document structure", error);
      toast.error(
        error instanceof Error ? error.message : "无法读取当前故事的文档结构。",
      );
      return null;
    } finally {
      if (get().storyWorkspace?.path === workspacePath) {
        set({ isLoadingDocumentStructure: false });
      }
    }
  },

  reloadStory: async () => {
    const version = contentVersion;
    const workspacePath = get().storyWorkspace?.path;
    const storyId = get().storyWorkspace?.id;
    if (!storyId) return null;
    const loaded = await loadStoryById(storyId);
    if (
      loaded &&
      version === contentVersion &&
      get().storyWorkspace?.path === workspacePath
    )
      get().openStory(loaded);
    return loaded;
  },

  writeDocuments: async (build) => {
    const workspace = get().storyWorkspace;
    if (!workspace) return null;
    contentVersion++;
    set({ isSaving: true });
    try {
      const project = await storyProjectApi.open(workspace.path);
      const {
        documents: nextDocuments,
        overview: nextOverview,
        structure,
      } = await commitDocumentWrites(project, build);
      if (get().storyWorkspace?.path === workspace.path) {
        contentVersion++;
        set({
          documents: nextDocuments,
          overview: nextOverview,
          documentStructure: structure,
        });
      }
      return nextDocuments;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "章节保存失败。");
      return null;
    } finally {
      if (get().storyWorkspace?.path === workspace.path)
        set({ isSaving: false });
    }
  },

  saveDocument: async (document) => {
    const { overview, storyWorkspace } = get();
    if (!overview || !storyWorkspace) {
      toast.error("找不到故事工作区，无法保存。");
      return null;
    }
    contentVersion++;
    set({ isSaving: true });
    try {
      const project = await storyProjectApi.open(storyWorkspace.path);
      const saved = await project.saveDocument(document);
      const [nextDocuments, nextOverview] = await Promise.all([
        project.listDocuments(),
        project.overview(),
      ]);
      let nextWorkspace = storyWorkspace;
      if (nextOverview.title && nextOverview.title !== storyWorkspace.name) {
        const record = await updateStoryRecordName(
          storyWorkspace.id,
          nextOverview.title,
        );
        nextWorkspace = {
          id: record.id,
          name: record.name,
          path: record.workspacePath,
        };
      }
      if (get().storyWorkspace?.path === storyWorkspace.path) {
        contentVersion++;
        set({
          documents: nextDocuments,
          overview: nextOverview,
          storyWorkspace: nextWorkspace,
        });
      }
      return (
        nextDocuments.find(
          (item) => storyDocumentKey(item) === storyDocumentKey(saved),
        ) ?? saved
      );
    } catch (error) {
      console.error("Failed to save story document", error);
      toast.error(
        error instanceof Error ? error.message : "故事资料保存失败。",
      );
      return null;
    } finally {
      if (get().storyWorkspace?.path === storyWorkspace.path)
        set({ isSaving: false });
    }
  },

  createDocument: async (ref, value) => {
    if (
      get().documents.some(
        (document) => storyDocumentKey(document) === storyDocumentKey({ ref }),
      )
    ) {
      toast.error("相同引用的故事文档已经存在。");
      return null;
    }
    return get().saveDocument({ ref, value });
  },

  deleteDocument: async (ref) => {
    const { overview, storyWorkspace } = get();
    if (!overview || !storyWorkspace) return false;
    contentVersion++;
    set({ isSaving: true });
    try {
      const project = await storyProjectApi.open(storyWorkspace.path);
      await project.removeDocument(ref);
      const [nextDocuments, nextOverview] = await Promise.all([
        project.listDocuments(),
        project.overview(),
      ]);
      if (get().storyWorkspace?.path === storyWorkspace.path) {
        contentVersion++;
        set({ documents: nextDocuments, overview: nextOverview });
      }
      return true;
    } catch (error) {
      console.error("Failed to delete story document", error);
      toast.error(
        error instanceof Error ? error.message : "故事资料删除失败。",
      );
      return false;
    } finally {
      if (get().storyWorkspace?.path === storyWorkspace.path)
        set({ isSaving: false });
    }
  },
}));
