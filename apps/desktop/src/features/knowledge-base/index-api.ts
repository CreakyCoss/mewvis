import { invoke, isTauri } from "@tauri-apps/api/core";
import { missingKnowledgeIndexStatus } from "./api-preview";
import type {
  KnowledgeIndexStatus,
  RebuildKnowledgeIndexResult,
} from "./types";

export const getKnowledgeIndexStatus = () => {
  if (!isTauri()) {
    return Promise.resolve(missingKnowledgeIndexStatus());
  }

  return invoke<KnowledgeIndexStatus>("get_knowledge_index_status");
};

export const rebuildKnowledgeIndex = (sourceIds?: string[]) => {
  if (!isTauri()) {
    return Promise.resolve<RebuildKnowledgeIndexResult>({
      status: missingKnowledgeIndexStatus(),
      sourceResults: [],
    });
  }

  return invoke<RebuildKnowledgeIndexResult>("rebuild_knowledge_index", {
    input: sourceIds ? { sourceIds } : null,
  });
};
