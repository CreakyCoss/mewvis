import { invoke, isTauri } from "@tauri-apps/api/core";
import { emptyKnowledgeLibrary, emptyKnowledgeSettings } from "./api-preview";
import type {
  EmbeddingProfile,
  KnowledgeLibrary,
  KnowledgeSettings,
  SaveEmbeddingProfileInput,
  SaveKnowledgeCollectionInput,
  SaveKnowledgeSettingsInput,
  SaveKnowledgeSourceInput,
} from "./types";

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

export const listEmbeddingProfiles = () => {
  if (!isTauri()) {
    return Promise.resolve<EmbeddingProfile[]>([]);
  }

  return invoke<EmbeddingProfile[]>("list_embedding_profiles");
};

export const saveEmbeddingProfile = (input: SaveEmbeddingProfileInput) => {
  if (!isTauri()) {
    return Promise.resolve<EmbeddingProfile[]>([
      {
        id: input.id ?? "local-preview",
        name: input.name,
        providerKind: input.providerKind,
        baseUrl: input.baseUrl ?? null,
        apiKey: input.apiKey ?? null,
        modelId: input.modelId,
        dimensions: input.dimensions,
        batchSize: input.batchSize ?? 32,
        isDefault: input.isDefault,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
  }

  return invoke<EmbeddingProfile[]>("save_embedding_profile", { input });
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
