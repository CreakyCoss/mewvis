import { invoke } from "@/transport";

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

export const listEmbeddingProfiles = () => {
  return invoke<EmbeddingProfile[]>("list_embedding_profiles");
};

export const saveEmbeddingProfile = (input: SaveEmbeddingProfileInput) => {
  return invoke<EmbeddingProfile[]>("save_embedding_profile", { input });
};

export const deleteEmbeddingProfile = (profileId: string) => {
  return invoke<EmbeddingProfile[]>("delete_embedding_profile", { profileId });
};
