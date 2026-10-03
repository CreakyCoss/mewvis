import { useCallback, useEffect, useRef, useState } from "react";
import { getApplicationHost } from "@mewvis/app-sdk/browser";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import { repository, type Repository } from "./repository";
import {
  normalizeFeeds,
  normalizeArticles,
  mergeArticles,
  type Feed,
  type FeedCache,
  type MarkMap,
  type Marks,
  type Preferences,
} from "./model";

export async function tool<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = await getApplicationHost().executeTool<T>(name, args);
  return response.value;
}
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function useReader() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [caches, setCaches] = useState<FeedCache[]>([]);
  const [marks, setMarks] = useState<MarkMap>({});
  const [prefs, setPrefs] = useState<Preferences>({
    fontSize: 16,
    sort: "newest",
  });
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 });
  const [feedErrors, setFeedErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const repo = useRef<Repository | null>(null),
    cacheRef = useRef<FeedCache[]>([]),
    marksRef = useRef<MarkMap>({});
  const syncLock = useRef(false),
    writeCounts = useRef(new Map<string, number>()),
    boot = useRef<Promise<void> | null>(null);
  const feedRef = useRef<Feed[]>([]);
  const sync = useCallback(async (targets: Feed[] = feedRef.current) => {
    if (syncLock.current || !repo.current || !targets.length) return;
    syncLock.current = true;
    setSyncing(true);
    setProgress({ done: 0, total: targets.length });
    let next = 0;
    try {
      const worker = async () => {
        while (next < targets.length) {
          const feed = targets[next++];
          try {
            const value = await tool<{ entries: unknown }>("rss_fetch", {
              url: feed.url,
              limit: 40,
            });
            const old = cacheRef.current.find(
              (cache) => cache.feed.url === feed.url,
            );
            const cache: FeedCache = {
              version: 1,
              feed,
              articles: mergeArticles(
                old?.articles ?? [],
                normalizeArticles(value.entries, feed),
                marksRef.current,
              ),
              updated: Date.now(),
            };
            await repo.current!.saveCache(cache);
            cacheRef.current = [
              ...cacheRef.current.filter((item) => item.feed.url !== feed.url),
              cache,
            ];
            setCaches(cacheRef.current);
            setFeedErrors((current) => {
              const copy = { ...current };
              delete copy[feed.url];
              return copy;
            });
          } catch (cause) {
            setFeedErrors((current) => ({
              ...current,
              [feed.url]: errorText(cause),
            }));
          } finally {
            setProgress((current) => ({ ...current, done: current.done + 1 }));
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(3, targets.length) }, worker),
      );
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, []);
  const refreshFeeds = useCallback(async () => {
    const value = await tool<{ feeds: unknown }>("rss_list");
    const next = normalizeFeeds(value.feeds);
    feedRef.current = next;
    setFeeds(next);
    return next;
  }, []);
  const initialize = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    setError("");
    try {
      repo.current = repository(getApplicationDataClient().storage);
      const saved = await repo.current.load();
      cacheRef.current = saved.caches;
      marksRef.current = saved.marks;
      setCaches(saved.caches);
      setMarks(saved.marks);
      setPrefs(saved.preferences);
      const next = await refreshFeeds();
      setLoading(false);
      const stale = next.filter(
        (feed) =>
          !saved.caches.some(
            (cache) =>
              cache.feed.url === feed.url &&
              Date.now() - cache.updated < 15 * 60 * 1000,
          ),
      );
      void sync(stale);
    } catch (cause) {
      setError(errorText(cause));
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [refreshFeeds, sync]);
  useEffect(() => {
    if (!boot.current) boot.current = initialize();
  }, [initialize]);
  const changeMarks = useCallback(async (id: string, patch: Partial<Marks>) => {
    if (!repo.current) return false;
    writeCounts.current.set(id, (writeCounts.current.get(id) ?? 0) + 1);
    setPending(new Set(writeCounts.current.keys()));
    try {
      const next = await repo.current.changeMarks(id, patch);
      marksRef.current = { ...marksRef.current, [id]: next };
      setMarks(marksRef.current);
      return true;
    } catch (cause) {
      setError(`阅读状态未保存：${errorText(cause)}`);
      return false;
    } finally {
      const remaining = (writeCounts.current.get(id) ?? 1) - 1;
      if (remaining) writeCounts.current.set(id, remaining);
      else writeCounts.current.delete(id);
      setPending(new Set(writeCounts.current.keys()));
    }
  }, []);
  const changePreferences = useCallback(async (value: Preferences) => {
    if (!repo.current) return;
    try {
      await repo.current.savePreferences(value);
      setPrefs(value);
    } catch (cause) {
      setError(`阅读设置未保存：${errorText(cause)}`);
    }
  }, []);
  return {
    feeds,
    caches,
    marks,
    prefs,
    loading,
    failed,
    error,
    setError,
    syncing,
    progress,
    feedErrors,
    pending,
    sync,
    refreshFeeds,
    retry: initialize,
    changeMarks,
    changePreferences,
  };
}
