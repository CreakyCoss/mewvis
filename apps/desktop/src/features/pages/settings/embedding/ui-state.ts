import type { EmbeddingProfile } from "@/features/embedding/types";

export type EmbeddingProviderKind = "openai-compatible" | "ollama";

export type EmbeddingDraft = {
  id: string | null;
  name: string;
  providerKind: EmbeddingProviderKind;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  dimensions: number;
  batchSize: number;
};

export const localOllamaBaseUrl = "http://127.0.0.1:11434";
export const localOllamaModelId = "nomic-embed-text";
export const localOllamaDimensions = 768;
export const localOllamaBatchSize = 1;

export const localOllamaModelOptions = [
  { id: "embeddinggemma", modelId: "embeddinggemma", modelName: "embeddinggemma" },
  { id: "nomic-embed-text", modelId: "nomic-embed-text", modelName: "nomic-embed-text" },
];

export const openAiCompatibleEmbeddingModelOptions = [
  { id: "text-embedding-3-small", modelId: "text-embedding-3-small", modelName: "text-embedding-3-small" },
  { id: "text-embedding-3-large", modelId: "text-embedding-3-large", modelName: "text-embedding-3-large" },
];

const normalizeEmbeddingProviderKind = (providerKind?: string | null): EmbeddingProviderKind =>
  providerKind === "ollama" ? "ollama" : "openai-compatible";

export const emptyEmbeddingDraft = (): EmbeddingDraft => ({
  id: null,
  name: "",
  providerKind: "openai-compatible",
  baseUrl: "",
  apiKey: "",
  modelId: "",
  dimensions: 1536,
  batchSize: 32,
});

export const embeddingDraftFromProfile = (profile: EmbeddingProfile | null): EmbeddingDraft => {
  const providerKind = normalizeEmbeddingProviderKind(profile?.providerKind);

  return {
    id: profile?.id ?? null,
    name: profile?.name ?? "",
    providerKind,
    baseUrl: providerKind === "ollama" ? (profile?.baseUrl ?? localOllamaBaseUrl) : (profile?.baseUrl ?? ""),
    apiKey: profile?.apiKey ?? "",
    modelId: profile?.modelId ?? "",
    dimensions:
      providerKind === "ollama" ? (profile?.dimensions ?? localOllamaDimensions) : (profile?.dimensions ?? 1536),
    batchSize: providerKind === "ollama" ? localOllamaBatchSize : (profile?.batchSize ?? 32),
  };
};
