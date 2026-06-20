export type QuickSummaryTab = "summary" | "novel";

export type QuickNovelExportFormat = "txt" | "md";

export type QuickSummaryCache = {
  sceneId: string;
  signature: string;
  content: string;
  generatedAt: number;
  novelContent?: string;
  novelGeneratedAt?: number;
  novelSignature?: string;
};

export type QuickSummaryCacheState = {
  workspaceId: string;
  entries: Record<string, QuickSummaryCache>;
};
