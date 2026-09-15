import { invoke } from "@/transport";
import type {
  KnowledgeCollectionFile,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSearchResult,
  KnowledgeSettings,
  RebuildKnowledgeIndexResult,
  SaveKnowledgeCollectionInput,
  SaveKnowledgeSettingsInput,
  SaveKnowledgeSourceInput,
} from "@/workbench/pages/knowledge/types";

export const listKnowledgeLibrary = () => {
  return invoke<KnowledgeLibrary>("list_knowledge_library");
};

export const getKnowledgeSettings = () => {
  return invoke<KnowledgeSettings>("get_knowledge_settings");
};

export const saveKnowledgeSettings = (input: SaveKnowledgeSettingsInput) => {
  return invoke<KnowledgeSettings>("save_knowledge_settings", { input });
};

export const saveKnowledgeCollection = (input: SaveKnowledgeCollectionInput) => {
  return invoke<KnowledgeLibrary>("save_knowledge_collection", { input });
};

export const deleteKnowledgeCollection = (collectionId: string) => {
  return invoke<KnowledgeLibrary>("delete_knowledge_collection", { collectionId });
};

export const saveKnowledgeSource = (input: SaveKnowledgeSourceInput) => {
  return invoke<KnowledgeLibrary>("save_knowledge_source", { input });
};

export const importKnowledgeFiles = (paths: string[]) => {
  return invoke<KnowledgeLibrary>("import_knowledge_files", { input: { paths } });
};

export const deleteKnowledgeSource = (sourceId: string) => {
  return invoke<KnowledgeLibrary>("delete_knowledge_source", { sourceId });
};

export const setKnowledgeCollectionSources = (collectionId: string, sourceIds: string[]) => {
  return invoke<KnowledgeLibrary>("set_knowledge_collection_sources", { input: { collectionId, sourceIds } });
};

export const setKnowledgeCollectionEmbeddingProfile = (collectionId: string, embeddingProfileId: string) => {
  return invoke<KnowledgeLibrary>("set_knowledge_collection_embedding_profile", {
    input: { collectionId, embeddingProfileId },
  });
};

export const listKnowledgeCollectionFiles = (collectionId: string) => {
  return invoke<KnowledgeCollectionFile[]>("list_knowledge_collection_files", { collectionId });
};

export const getKnowledgeIndexStatus = (collectionId?: string | null) => {
  return invoke<KnowledgeIndexStatus>("get_knowledge_index_status", { collectionId: collectionId ?? null });
};

export const rebuildKnowledgeIndex = (collectionId: string) => {
  return invoke<RebuildKnowledgeIndexResult>("rebuild_knowledge_index", { input: { collectionId } });
};

export const searchEnabledKnowledge = (input: {
  workspaceId?: string | null;
  collectionIds?: string[];
  query: string;
  maxResults?: number;
  minScore?: number;
}) => {
  return invoke<KnowledgeSearchResult>("search_workspace_knowledge", {
    input: { ...input, workspaceId: input.workspaceId ?? "" },
  });
};
