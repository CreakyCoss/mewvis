import type {
  EmbeddingProfile,
  KnowledgeCollection,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSettings,
  KnowledgeSource,
} from "./types";

export type KnowledgeBaseView = "overview" | "files" | "collections";

export type CollectionDraft = {
  id: string | null;
  name: string;
  description: string;
};

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

export type EmbeddingProviderKind = "openai-compatible" | "ollama";

export type PendingDeleteTarget =
  { kind: "source"; source: KnowledgeSource } | { kind: "collection"; collection: KnowledgeCollection };

export type PendingKnowledgeAction = "rebuild-index" | "save-embedding" | null;

export const supportedTextExtensions = [
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "rs",
  "toml",
  "yaml",
  "yml",
];

export const emptyLibrary: KnowledgeLibrary = {
  collections: [],
  sources: [],
};

export const missingStatus: KnowledgeIndexStatus = {
  indexId: "global",
  version: 1,
  status: "missing",
  updatedAt: null,
  sourceFingerprint: null,
  documentCount: 0,
  chunkCount: 0,
  error: null,
};

export const emptySettings: KnowledgeSettings = {
  storageDirectory: null,
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

export const emptyCollectionDraft = (): CollectionDraft => ({
  id: null,
  name: "",
  description: "",
});

export const emptyEmbeddingDraft = (): EmbeddingDraft => ({
  id: null,
  name: "默认语义检索",
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
    name: profile?.name ?? "默认语义检索",
    providerKind,
    baseUrl: providerKind === "ollama" ? (profile?.baseUrl ?? localOllamaBaseUrl) : (profile?.baseUrl ?? ""),
    apiKey: profile?.apiKey ?? "",
    modelId: profile?.modelId ?? "",
    dimensions:
      providerKind === "ollama" ? (profile?.dimensions ?? localOllamaDimensions) : (profile?.dimensions ?? 1536),
    batchSize: providerKind === "ollama" ? localOllamaBatchSize : (profile?.batchSize ?? 32),
  };
};

export const formatTime = (timestamp: number | null) =>
  timestamp
    ? new Intl.DateTimeFormat(undefined, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(timestamp))
    : "尚未构建";

export const statusLabel = (status: string) =>
  ({
    missing: "未构建",
    building: "构建中",
    ready: "可用",
    stale: "需重建",
    error: "异常",
  })[status] ?? status;

export const sourceKindLabel = (kind: string) =>
  ({
    file: "文件",
    directory: "目录源",
    manual: "手动",
  })[kind] ?? kind;

export const relativeKnowledgePath = (uri: string, storageDirectory: string | null) => {
  if (!storageDirectory) {
    return uri;
  }

  const normalizedUri = uri.replace(/\\/g, "/");
  const normalizedDirectory = storageDirectory.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalizedUri === normalizedDirectory) {
    return ".";
  }
  if (normalizedUri.startsWith(`${normalizedDirectory}/`)) {
    return normalizedUri.slice(normalizedDirectory.length + 1);
  }

  return uri;
};
