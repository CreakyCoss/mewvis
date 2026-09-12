import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  KnowledgeCollectionFile,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeSearchResult,
  KnowledgeSettings,
  RebuildKnowledgeIndexResult,
  SaveKnowledgeCollectionInput,
  SaveKnowledgeSettingsInput,
  SaveKnowledgeSourceInput,
} from "@/workbench/pages/knowledge/types";

const previewNow = Date.now();

let previewKnowledgeLibrary: KnowledgeLibrary = {
  collections: [
    {
      id: "preview-product-design",
      name: "产品设计资料库",
      description: "产品规范、研究与设计决策",
      sourceDirectory: "/Users/demo/Documents/product-design",
      color: null,
      order: 0,
      enabled: true,
      embeddingProfileId: "preview-openai",
      sourceIds: ["preview-source-product-design"],
      createdAt: previewNow - 12 * 86_400_000,
      updatedAt: previewNow - 18 * 60_000,
    },
    {
      id: "preview-engineering",
      name: "工程文档",
      description: "架构、API 与部署文档",
      sourceDirectory: "/Users/demo/Development/engineering-docs",
      color: null,
      order: 1,
      enabled: true,
      embeddingProfileId: "preview-bge",
      sourceIds: ["preview-source-engineering"],
      createdAt: previewNow - 9 * 86_400_000,
      updatedAt: previewNow - 42 * 60_000,
    },
    {
      id: "preview-support",
      name: "客户支持手册",
      description: "常见问题、服务流程与处理规范",
      sourceDirectory: "/Users/demo/Documents/customer-support",
      color: null,
      order: 2,
      enabled: true,
      embeddingProfileId: "preview-openai",
      sourceIds: ["preview-source-support"],
      createdAt: previewNow - 6 * 86_400_000,
      updatedAt: previewNow - 2 * 3_600_000,
    },
    {
      id: "preview-marketing",
      name: "市场营销资料",
      description: "品牌、市场活动与内容素材",
      sourceDirectory: "/Users/demo/Documents/marketing",
      color: null,
      order: 3,
      enabled: true,
      embeddingProfileId: "preview-bge",
      sourceIds: ["preview-source-marketing"],
      createdAt: previewNow - 4 * 86_400_000,
      updatedAt: previewNow - 5 * 3_600_000,
    },
    {
      id: "preview-legacy",
      name: "旧版知识库",
      description: "等待重新配置向量模型",
      sourceDirectory: "/Users/demo/Documents/legacy-knowledge",
      color: null,
      order: 5,
      enabled: true,
      embeddingProfileId: "deleted-profile",
      sourceIds: ["preview-source-legacy"],
      createdAt: previewNow - 24 * 86_400_000,
      updatedAt: previewNow - 2 * 86_400_000,
    },
    {
      id: "preview-hr",
      name: "人力资源政策",
      description: "员工手册、制度与流程",
      sourceDirectory: "/Users/demo/Documents/hr-policy",
      color: null,
      order: 4,
      enabled: true,
      embeddingProfileId: "preview-openai",
      sourceIds: ["preview-source-hr"],
      createdAt: previewNow - 5 * 86_400_000,
      updatedAt: previewNow - 18 * 3_600_000,
    },
  ],
  sources: [],
};

const previewStatuses = new Map<string, KnowledgeIndexStatus>([
  ["preview-product-design", readyStatus("preview-product-design", 1248, 9680, previewNow - 18 * 60_000)],
  ["preview-engineering", readyStatus("preview-engineering", 3672, 28410, previewNow - 42 * 60_000)],
  ["preview-support", readyStatus("preview-support", 856, 12480, previewNow - 2 * 3_600_000)],
  ["preview-marketing", staleStatus("preview-marketing", 432, 3891, previewNow - 5 * 3_600_000)],
  ["preview-legacy", staleStatus("preview-legacy", 1102, 8440, previewNow - 2 * 86_400_000)],
  ["preview-hr", missingStatus("preview-hr")],
]);

const previewFiles = new Map<string, KnowledgeCollectionFile[]>([
  [
    "preview-product-design",
    [
      previewFile("设计系统规范.md", "design-system/设计系统规范.md", 18_240, previewNow - 32 * 60_000),
      previewFile("用户研究总结.md", "research/用户研究总结.md", 42_810, previewNow - 80 * 60_000),
      previewFile("组件验收清单.md", "delivery/组件验收清单.md", 12_440, previewNow - 26 * 3_600_000),
      previewFile("信息架构.md", "product/信息架构.md", 23_180, previewNow - 3 * 86_400_000),
    ],
  ],
  [
    "preview-engineering",
    [
      previewFile("部署指南.md", "docs/deployment/部署指南.md", 31_040, previewNow - 42 * 60_000),
      previewFile("API 参考.md", "docs/reference/API 参考.md", 86_240, previewNow - 3 * 3_600_000),
      previewFile("架构概览.md", "docs/architecture/架构概览.md", 28_320, previewNow - 8 * 3_600_000),
      previewFile("快速开始.md", "docs/quickstart.md", 14_920, previewNow - 2 * 86_400_000),
    ],
  ],
]);

function readyStatus(id: string, documentCount: number, chunkCount: number, updatedAt: number): KnowledgeIndexStatus {
  return {
    indexId: id,
    version: 3,
    status: "ready",
    updatedAt,
    sourceFingerprint: `${id}-ready`,
    documentCount,
    chunkCount,
    error: null,
  };
}

function staleStatus(id: string, documentCount: number, chunkCount: number, updatedAt: number): KnowledgeIndexStatus {
  return { ...readyStatus(id, documentCount, chunkCount, updatedAt), status: "stale" };
}

function missingStatus(id: string): KnowledgeIndexStatus {
  return {
    indexId: id,
    version: 3,
    status: "missing",
    updatedAt: null,
    sourceFingerprint: null,
    documentCount: 0,
    chunkCount: 0,
    error: null,
  };
}

function previewFile(
  name: string,
  relativePath: string,
  sizeBytes: number,
  modifiedAt: number,
): KnowledgeCollectionFile {
  return { name, relativePath, sizeBytes, modifiedAt };
}

const cloneLibrary = () => structuredClone(previewKnowledgeLibrary);

export const listKnowledgeLibrary = () => {
  if (!isTauri()) return Promise.resolve(cloneLibrary());
  return invoke<KnowledgeLibrary>("list_knowledge_library");
};

export const getKnowledgeSettings = () => {
  if (!isTauri()) {
    return Promise.resolve<KnowledgeSettings>({
      storageDirectory: previewKnowledgeLibrary.collections[0]?.sourceDirectory ?? null,
    });
  }
  return invoke<KnowledgeSettings>("get_knowledge_settings");
};

export const saveKnowledgeSettings = (input: SaveKnowledgeSettingsInput) => {
  if (!isTauri()) return Promise.resolve<KnowledgeSettings>({ storageDirectory: input.storageDirectory ?? null });
  return invoke<KnowledgeSettings>("save_knowledge_settings", { input });
};

export const saveKnowledgeCollection = (input: SaveKnowledgeCollectionInput) => {
  if (!isTauri()) {
    const now = Date.now();
    const id = input.id ?? `preview-knowledge-${now}`;
    const existing = previewKnowledgeLibrary.collections.find((collection) => collection.id === id);
    const sourceId = existing?.sourceIds[0] ?? `preview-source-${now}`;
    const nextCollection = {
      id,
      name: input.name,
      description: input.description ?? null,
      sourceDirectory: input.sourceDirectory ?? null,
      color: input.color ?? null,
      order: input.order ?? existing?.order ?? previewKnowledgeLibrary.collections.length,
      enabled: input.enabled,
      embeddingProfileId: input.embeddingProfileId ?? null,
      sourceIds: [sourceId],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    previewKnowledgeLibrary.collections = previewKnowledgeLibrary.collections.filter(
      (collection) => collection.id !== id,
    );
    previewKnowledgeLibrary.collections.push(nextCollection);
    if (!previewStatuses.has(id)) {
      previewStatuses.set(id, missingStatus(id));
    } else if (
      existing &&
      (existing.sourceDirectory !== nextCollection.sourceDirectory ||
        existing.embeddingProfileId !== nextCollection.embeddingProfileId)
    ) {
      const currentStatus = previewStatuses.get(id) ?? missingStatus(id);
      previewStatuses.set(id, {
        ...currentStatus,
        status: "stale",
        sourceFingerprint: null,
        updatedAt: now,
      });
    }
    if (!previewFiles.has(id)) previewFiles.set(id, []);
    return Promise.resolve(cloneLibrary());
  }
  return invoke<KnowledgeLibrary>("save_knowledge_collection", { input });
};

export const deleteKnowledgeCollection = (collectionId: string) => {
  if (!isTauri()) {
    previewKnowledgeLibrary.collections = previewKnowledgeLibrary.collections.filter(
      (collection) => collection.id !== collectionId,
    );
    previewStatuses.delete(collectionId);
    previewFiles.delete(collectionId);
    return Promise.resolve(cloneLibrary());
  }
  return invoke<KnowledgeLibrary>("delete_knowledge_collection", { collectionId });
};

export const saveKnowledgeSource = (input: SaveKnowledgeSourceInput) => {
  if (!isTauri()) return Promise.resolve(cloneLibrary());
  return invoke<KnowledgeLibrary>("save_knowledge_source", { input });
};

export const importKnowledgeFiles = (paths: string[]) => {
  if (!isTauri()) return Promise.resolve(cloneLibrary());
  return invoke<KnowledgeLibrary>("import_knowledge_files", { input: { paths } });
};

export const deleteKnowledgeSource = (sourceId: string) => {
  if (!isTauri()) return Promise.resolve(cloneLibrary());
  return invoke<KnowledgeLibrary>("delete_knowledge_source", { sourceId });
};

export const setKnowledgeCollectionSources = (collectionId: string, sourceIds: string[]) => {
  if (!isTauri()) return Promise.resolve(cloneLibrary());
  return invoke<KnowledgeLibrary>("set_knowledge_collection_sources", { input: { collectionId, sourceIds } });
};

export const setKnowledgeCollectionEmbeddingProfile = (collectionId: string, embeddingProfileId: string) => {
  if (!isTauri()) {
    const collection = previewKnowledgeLibrary.collections.find((item) => item.id === collectionId);
    if (collection) {
      collection.embeddingProfileId = embeddingProfileId;
      collection.updatedAt = Date.now();
      previewStatuses.set(collectionId, staleStatus(collectionId, 0, 0, Date.now()));
    }
    return Promise.resolve(cloneLibrary());
  }
  return invoke<KnowledgeLibrary>("set_knowledge_collection_embedding_profile", {
    input: { collectionId, embeddingProfileId },
  });
};

export const listKnowledgeCollectionFiles = (collectionId: string) => {
  if (!isTauri()) return Promise.resolve(structuredClone(previewFiles.get(collectionId) ?? []));
  return invoke<KnowledgeCollectionFile[]>("list_knowledge_collection_files", { collectionId });
};

export const getKnowledgeIndexStatus = (collectionId?: string | null) => {
  const id = collectionId?.trim() || "global";
  if (!isTauri()) return Promise.resolve(structuredClone(previewStatuses.get(id) ?? missingStatus(id)));
  return invoke<KnowledgeIndexStatus>("get_knowledge_index_status", { collectionId: collectionId ?? null });
};

export const rebuildKnowledgeIndex = (collectionId: string) => {
  if (!isTauri()) {
    const files = previewFiles.get(collectionId) ?? [];
    const status = readyStatus(collectionId, files.length || 24, Math.max(files.length * 18, 320), Date.now());
    previewStatuses.set(collectionId, status);
    return Promise.resolve<RebuildKnowledgeIndexResult>({ status, sourceResults: [] });
  }
  return invoke<RebuildKnowledgeIndexResult>("rebuild_knowledge_index", { input: { collectionId } });
};

export const searchEnabledKnowledge = (input: {
  workspaceId?: string | null;
  collectionIds?: string[];
  query: string;
  maxResults?: number;
  minScore?: number;
}) => {
  if (!isTauri()) {
    const selectedCollectionIds = input.collectionIds ? new Set(input.collectionIds) : null;
    return Promise.resolve<KnowledgeSearchResult>({
      matches: [],
      enabledSourceIds: previewKnowledgeLibrary.collections
        .filter(
          (collection) => collection.enabled && (!selectedCollectionIds || selectedCollectionIds.has(collection.id)),
        )
        .flatMap((collection) => collection.sourceIds),
    });
  }
  return invoke<KnowledgeSearchResult>("search_workspace_knowledge", {
    input: { ...input, workspaceId: input.workspaceId ?? "" },
  });
};
