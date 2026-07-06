import type { QuickSummaryCache } from "./types";

const QUICK_SUMMARY_CACHE_STORAGE_PREFIX = "novel-claw:tavern:quick-summary";

const quickSummaryCacheStorageKey = (workspaceId: string) => `${QUICK_SUMMARY_CACHE_STORAGE_PREFIX}:${workspaceId}`;

const normalizeQuickSummaryCacheItem = (value: unknown): QuickSummaryCache | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<QuickSummaryCache>;
  if (
    typeof candidate.sceneId !== "string" ||
    typeof candidate.signature !== "string" ||
    typeof candidate.generatedAt !== "number"
  ) {
    return null;
  }

  return {
    sceneId: candidate.sceneId,
    signature: candidate.signature,
    content: typeof candidate.content === "string" ? candidate.content : "",
    generatedAt: candidate.generatedAt,
    novelContent: typeof candidate.novelContent === "string" ? candidate.novelContent : undefined,
    novelGeneratedAt: typeof candidate.novelGeneratedAt === "number" ? candidate.novelGeneratedAt : undefined,
    novelSignature: typeof candidate.novelSignature === "string" ? candidate.novelSignature : undefined,
  };
};

export const loadQuickSummaryCache = (workspaceId: string): Record<string, QuickSummaryCache> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(quickSummaryCacheStorageKey(workspaceId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([sceneId, value]) => {
        const item = normalizeQuickSummaryCacheItem(value);
        return item ? [[sceneId, item]] : [];
      }),
    );
  } catch {
    return {};
  }
};

export const saveQuickSummaryCache = (workspaceId: string, cache: Record<string, QuickSummaryCache>) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(quickSummaryCacheStorageKey(workspaceId), JSON.stringify(cache));
  } catch {
    // Ignore quota and private-mode storage failures; the in-memory cache still works.
  }
};

export const writeQuickSummaryCacheEntry = ({
  entries,
  sceneId,
  signature,
  content,
}: {
  entries: Record<string, QuickSummaryCache>;
  sceneId: string;
  signature: string;
  content: string;
}) => {
  const previous = entries[sceneId];
  const shouldKeepNovel = previous?.novelSignature === signature;

  return {
    ...entries,
    [sceneId]: {
      sceneId,
      signature,
      content,
      generatedAt: Date.now(),
      ...(shouldKeepNovel
        ? {
            novelContent: previous.novelContent,
            novelGeneratedAt: previous.novelGeneratedAt,
            novelSignature: previous.novelSignature,
          }
        : {}),
    },
  };
};

export const writeQuickNovelCacheEntry = ({
  entries,
  sceneId,
  signature,
  novelContent,
}: {
  entries: Record<string, QuickSummaryCache>;
  sceneId: string;
  signature: string;
  novelContent: string;
}) => {
  const previous = entries[sceneId];
  const shouldKeepSummary = previous?.signature === signature;

  return {
    ...entries,
    [sceneId]: {
      sceneId,
      signature,
      content: shouldKeepSummary ? previous.content : "",
      generatedAt: shouldKeepSummary ? previous.generatedAt : Date.now(),
      novelContent,
      novelGeneratedAt: Date.now(),
      novelSignature: signature,
    },
  };
};
