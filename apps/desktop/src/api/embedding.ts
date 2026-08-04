import { invoke, isTauri } from "@tauri-apps/api/core";

export type EmbeddingProviderKind = "openai-compatible" | "ollama";

export type EmbeddingProfile = {
  id: string;
  name: string;
  providerKind: EmbeddingProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  modelId: string;
  dimensions: number;
  batchSize: number;
  knowledgeBaseCount: number;
  createdAt: number;
  updatedAt: number;
};

export type SaveEmbeddingProfileInput = {
  id?: string | null;
  name: string;
  providerKind: EmbeddingProviderKind;
  baseUrl?: string | null;
  apiKey?: string | null;
  modelId: string;
  dimensions: number;
  batchSize?: number | null;
};

let previewEmbeddingProfiles: EmbeddingProfile[] = [
  {
    id: "preview-bge",
    name: "本地中文向量",
    providerKind: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    apiKey: null,
    modelId: "bge-large-zh-v1.5",
    dimensions: 1024,
    batchSize: 16,
    knowledgeBaseCount: 2,
    createdAt: Date.now() - 8 * 86_400_000,
    updatedAt: Date.now() - 3 * 86_400_000,
  },
  {
    id: "preview-openai",
    name: "OpenAI Embedding",
    providerKind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "preview-key",
    modelId: "text-embedding-3-large",
    dimensions: 3072,
    batchSize: 32,
    knowledgeBaseCount: 2,
    createdAt: Date.now() - 6 * 86_400_000,
    updatedAt: Date.now() - 2 * 86_400_000,
  },
];

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
