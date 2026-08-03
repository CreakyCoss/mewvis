import type {
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
  embeddingProfileId: string;
};

export type PendingDeleteTarget =
  { kind: "source"; source: KnowledgeSource } | { kind: "collection"; collection: KnowledgeCollection };

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

export const emptyCollectionDraft = (): CollectionDraft => ({
  id: null,
  name: "",
  description: "",
  embeddingProfileId: "",
});

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
