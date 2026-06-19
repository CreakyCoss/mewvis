import type {
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSettings,
} from "./types";

export const emptyKnowledgeLibrary = (): KnowledgeLibrary => ({
  collections: [],
  sources: [],
});

export const emptyKnowledgeSettings = (): KnowledgeSettings => ({
  storageDirectory: null,
});

export const missingKnowledgeIndexStatus = (): KnowledgeIndexStatus => ({
  indexId: "global",
  version: 1,
  status: "missing",
  updatedAt: null,
  sourceFingerprint: null,
  documentCount: 0,
  chunkCount: 0,
  error: null,
});
