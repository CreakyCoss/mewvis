import type { LlmProvider } from "@/ai/llm/types";
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
  providerId: string;
  providerKind: string;
  baseUrl: string;
  modelId: string;
  dimensions: number;
  batchSize: number;
};

export type PendingDeleteTarget =
  | { kind: "source"; source: KnowledgeSource }
  | { kind: "collection"; collection: KnowledgeCollection };

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

export const localOllamaProviderId = "__local_ollama__";
export const localOllamaBaseUrl = "http://127.0.0.1:11434";
export const localOllamaModelId = "nomic-embed-text";
export const localOllamaDimensions = 768;
export const localOllamaBatchSize = 1;
export const localOllamaModelOptions = [
  { id: "embeddinggemma", modelId: "embeddinggemma", modelName: "embeddinggemma" },
  { id: "nomic-embed-text", modelId: "nomic-embed-text", modelName: "nomic-embed-text" },
];

export const emptyCollectionDraft = (): CollectionDraft => ({
  id: null,
  name: "",
  description: "",
});

export const emptyEmbeddingDraft = (): EmbeddingDraft => ({
  id: null,
  name: "默认语义检索",
  providerId: "",
  providerKind: "openai-compatible",
  baseUrl: "",
  modelId: "",
  dimensions: 1536,
  batchSize: 32,
});

export const embeddingDraftFromProfile = (
  profile: EmbeddingProfile | null,
): EmbeddingDraft => ({
  id: profile?.id ?? null,
  name: profile?.name ?? "默认语义检索",
  providerId: profile?.providerKind === "ollama"
    ? localOllamaProviderId
    : profile?.providerId ?? "",
  providerKind: profile?.providerKind ?? "openai-compatible",
  baseUrl: profile?.providerKind === "ollama"
    ? profile?.baseUrl ?? localOllamaBaseUrl
    : profile?.baseUrl ?? "",
  modelId: profile?.modelId ?? "",
  dimensions: profile?.providerKind === "ollama"
    ? profile.dimensions
    : profile?.dimensions ?? 1536,
  batchSize: profile?.providerKind === "ollama"
    ? localOllamaBatchSize
    : profile?.batchSize ?? 32,
});

export const isEmbeddingProviderSupported = (provider: LlmProvider) =>
  [
    "openai",
    "openai-compatible",
    "openai-responses",
    "openai-completions",
  ].includes(provider.provider);

export const formatTime = (timestamp: number | null) =>
  timestamp
    ? new Intl.DateTimeFormat(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp))
    : "尚未构建";

export const statusLabel = (status: string) => ({
  missing: "未构建",
  building: "构建中",
  ready: "可用",
  stale: "需重建",
  error: "异常",
}[status] ?? status);

export const sourceKindLabel = (kind: string) => ({
  file: "文件",
  directory: "目录源",
  manual: "手动",
}[kind] ?? kind);

export const relativeKnowledgePath = (
  uri: string,
  storageDirectory: string | null,
) => {
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
