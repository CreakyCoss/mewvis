export type KnowledgeSourceKind = "file" | "directory" | "manual";

export type KnowledgeCollection = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  order: number;
  enabled: boolean;
  sourceIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeSource = {
  id: string;
  kind: KnowledgeSourceKind;
  uri: string;
  title: string;
  description: string | null;
  enabled: boolean;
  includePatternsJson: string | null;
  excludePatternsJson: string | null;
  metadataJson: string | null;
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeLibrary = {
  collections: KnowledgeCollection[];
  sources: KnowledgeSource[];
};

export type KnowledgeSettings = {
  storageDirectory: string | null;
};

export type EmbeddingProfile = {
  id: string;
  name: string;
  providerId: string | null;
  providerKind: string;
  baseUrl: string | null;
  modelId: string;
  dimensions: number;
  batchSize: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SaveKnowledgeCollectionInput = {
  id?: string | null;
  name: string;
  description?: string | null;
  color?: string | null;
  order?: number | null;
  enabled: boolean;
};

export type SaveKnowledgeSourceInput = {
  id?: string | null;
  kind: KnowledgeSourceKind;
  uri: string;
  title: string;
  description?: string | null;
  enabled: boolean;
  includePatternsJson?: string | null;
  excludePatternsJson?: string | null;
  metadataJson?: string | null;
};

export type SaveKnowledgeSettingsInput = {
  storageDirectory?: string | null;
};

export type SaveEmbeddingProfileInput = {
  id?: string | null;
  name: string;
  providerId?: string | null;
  providerKind: string;
  baseUrl?: string | null;
  modelId: string;
  dimensions: number;
  batchSize?: number | null;
  isDefault: boolean;
};

export type KnowledgeSearchMatch = {
  id: string;
  sourceId: string;
  chunkId: string | null;
  sourceType: string;
  content: string;
  path: string | null;
  title: string | null;
  score: number | null;
};

export type KnowledgeSearchResult = {
  matches: KnowledgeSearchMatch[];
  enabledSourceIds: string[];
};

export type KnowledgeIndexStatus = {
  indexId: string;
  version: number;
  status: "missing" | "building" | "ready" | "stale" | "error";
  updatedAt: number | null;
  sourceFingerprint: string | null;
  documentCount: number;
  chunkCount: number;
  error: string | null;
};

export type KnowledgeSourceIndexResult = {
  sourceId: string;
  status: string;
  documentCount: number;
  chunkCount: number;
  error: string | null;
};

export type RebuildKnowledgeIndexResult = {
  status: KnowledgeIndexStatus;
  sourceResults: KnowledgeSourceIndexResult[];
};
