import { invoke, isTauri } from "@tauri-apps/api/core";
import type { KnowledgeSearchResult } from "./types";

export const searchEnabledKnowledge = (input: {
  workspaceId?: string | null;
  query: string;
  maxResults?: number;
  minScore?: number;
}) => {
  if (!isTauri()) {
    return Promise.resolve<KnowledgeSearchResult>({
      matches: [],
      enabledSourceIds: [],
    });
  }

  return invoke<KnowledgeSearchResult>("search_workspace_knowledge", {
    input: {
      ...input,
      workspaceId: input.workspaceId ?? "",
    },
  });
};
