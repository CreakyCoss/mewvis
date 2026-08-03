export type EmbeddingProfile = {
  id: string;
  name: string;
  providerKind: string;
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
  providerKind: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  modelId: string;
  dimensions: number;
  batchSize?: number | null;
};

export const embeddingProviderLabel = (providerKind: string) =>
  providerKind === "ollama" ? "本地 Ollama" : "OpenAI-compatible";
