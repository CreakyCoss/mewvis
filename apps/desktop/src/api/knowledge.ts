import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSearchResult,
  KnowledgeSettings,
  RebuildKnowledgeIndexResult,
  SaveKnowledgeCollectionInput,
  SaveKnowledgeSettingsInput,
  SaveKnowledgeSourceInput,
} from "@/features/pages/knowledge/types";

const emptyKnowledgeLibrary = (): KnowledgeLibrary => ({
  collections: [],
  sources: [],
});

const emptyKnowledgeSettings = (): KnowledgeSettings => ({
  storageDirectory: null,
});

const missingKnowledgeIndexStatus = (): KnowledgeIndexStatus => ({
  indexId: "global",
  version: 1,
  status: "missing",
  updatedAt: null,
  sourceFingerprint: null,
  documentCount: 0,
  chunkCount: 0,
  error: null,
});

export const listKnowledgeLibrary = () => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("list_knowledge_library");
};

export const getKnowledgeSettings = () => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeSettings());
  }

  return invoke<KnowledgeSettings>("get_knowledge_settings");
};

export const saveKnowledgeSettings = (input: SaveKnowledgeSettingsInput) => {
  if (!isTauri()) {
    return Promise.resolve<KnowledgeSettings>({
      storageDirectory: input.storageDirectory ?? null,
    });
  }

  return invoke<KnowledgeSettings>("save_knowledge_settings", { input });
};

export const saveKnowledgeCollection = (input: SaveKnowledgeCollectionInput) => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("save_knowledge_collection", { input });
};

export const deleteKnowledgeCollection = (collectionId: string) => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("delete_knowledge_collection", { collectionId });
};

export const saveKnowledgeSource = (input: SaveKnowledgeSourceInput) => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("save_knowledge_source", { input });
};

export const importKnowledgeFiles = (paths: string[]) => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("import_knowledge_files", {
    input: { paths },
  });
};

export const deleteKnowledgeSource = (sourceId: string) => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("delete_knowledge_source", { sourceId });
};

export const setKnowledgeCollectionSources = (collectionId: string, sourceIds: string[]) => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("set_knowledge_collection_sources", {
    input: { collectionId, sourceIds },
  });
};

export const setKnowledgeCollectionEmbeddingProfile = (collectionId: string, embeddingProfileId: string) => {
  if (!isTauri()) {
    return Promise.resolve(emptyKnowledgeLibrary());
  }

  return invoke<KnowledgeLibrary>("set_knowledge_collection_embedding_profile", {
    input: { collectionId, embeddingProfileId },
  });
};

export const getKnowledgeIndexStatus = () => {
  if (!isTauri()) {
    return Promise.resolve(missingKnowledgeIndexStatus());
  }

  return invoke<KnowledgeIndexStatus>("get_knowledge_index_status");
};

export const rebuildKnowledgeIndex = (sourceIds?: string[]) => {
  if (!isTauri()) {
    return Promise.resolve<RebuildKnowledgeIndexResult>({
      status: missingKnowledgeIndexStatus(),
      sourceResults: [],
    });
  }

  return invoke<RebuildKnowledgeIndexResult>("rebuild_knowledge_index", {
    input: sourceIds ? { sourceIds } : null,
  });
};

export const searchEnabledKnowledge = (input: {
  workspaceId?: string | null;
  query: string;
  maxResults?: number;
  minScore?: number;
}) => {
  if (!isTauri()) {
    return Promise.resolve<KnowledgeSearchResult>({
      matches: [],
      enabledSourceIds: [],
    });
  }

  return invoke<KnowledgeSearchResult>("search_workspace_knowledge", {
    input: {
      ...input,
      workspaceId: input.workspaceId ?? "",
    },
  });
};
