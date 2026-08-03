import { invoke, isTauri } from "@tauri-apps/api/core";
import type { EmbeddingProfile, SaveEmbeddingProfileInput } from "@/features/embedding/types";

let previewEmbeddingProfiles: EmbeddingProfile[] = [];

export const listEmbeddingProfiles = () => {
  if (!isTauri()) {
    return Promise.resolve(previewEmbeddingProfiles);
  }

  return invoke<EmbeddingProfile[]>("list_embedding_profiles");
};

export const saveEmbeddingProfile = (input: SaveEmbeddingProfileInput) => {
  if (!isTauri()) {
    const now = Date.now();
    const id = input.id ?? `local-preview-${now}`;
    const existing = previewEmbeddingProfiles.find((profile) => profile.id === id);
    const nextProfile: EmbeddingProfile = {
      id,
      name: input.name,
      providerKind: input.providerKind,
      baseUrl: input.baseUrl ?? null,
      apiKey: input.apiKey ?? null,
      modelId: input.modelId,
      dimensions: input.dimensions,
      batchSize: input.batchSize ?? 32,
      knowledgeBaseCount: existing?.knowledgeBaseCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    previewEmbeddingProfiles = previewEmbeddingProfiles.filter((profile) => profile.id !== id);
    previewEmbeddingProfiles.push(nextProfile);
    return Promise.resolve(previewEmbeddingProfiles);
  }

  return invoke<EmbeddingProfile[]>("save_embedding_profile", { input });
};

export const deleteEmbeddingProfile = (profileId: string) => {
  if (!isTauri()) {
    if (!previewEmbeddingProfiles.some((profile) => profile.id === profileId)) {
      return Promise.reject(new Error("Embedding 配置不存在"));
    }
    previewEmbeddingProfiles = previewEmbeddingProfiles.filter((profile) => profile.id !== profileId);
    return Promise.resolve(previewEmbeddingProfiles);
  }

  return invoke<EmbeddingProfile[]>("delete_embedding_profile", { profileId });
};
