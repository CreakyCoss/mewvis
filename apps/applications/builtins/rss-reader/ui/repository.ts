import type { ApplicationStorage } from "@mewvis/app-sdk/data";
import {
  readCache,
  readMarks,
  preferences,
  record,
  type FeedCache,
  type Marks,
  type MarkMap,
  type Preferences,
} from "./model.ts";

const cachePrefix = "rss:feed:v1:",
  markPrefix = "rss:marks:v1:",
  prefKey = "rss:preferences:v1";
const chunkPrefix = "rss:cache-part:v1:";
// ApplicationFrame allows at most four application-data requests at a time.
const maxConcurrentReads = 4;
const chunkKeys = (value: unknown): string[] | null => {
  const item = record(value);
  if (item.version !== 2) return null;
  if (
    !Array.isArray(item.chunks) ||
    !item.chunks.length ||
    !item.chunks.every(
      (key) => typeof key === "string" && key.startsWith(chunkPrefix),
    )
  )
    throw new Error("阅读缓存索引不正确，未覆盖原数据。");
  return item.chunks;
};
export function repository(storage: ApplicationStorage) {
  let operations: Promise<unknown> = Promise.resolve();
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const next = operations.then(job, job);
    operations = next.catch(() => undefined);
    return next;
  };
  const loadCache = async (value: unknown) => {
    const keys = chunkKeys(value);
    if (!keys) return readCache(value);
    const parts: string[] = [];
    for (const key of keys) {
      const part = await storage.getItem(key);
      if (typeof part !== "string")
        throw new Error("阅读缓存不完整，未覆盖原数据。");
      parts.push(part);
    }
    return readCache(JSON.parse(parts.join("")));
  };
  return {
    load() {
      // Do not overlap a snapshot load with cache replacement or mark writes.
      return serial(async () => {
        const keys = await storage.keys();
        const caches: FeedCache[] = [],
          marks: MarkMap = {};
        const relevant = keys.filter(
          (key) => key.startsWith(cachePrefix) || key.startsWith(markPrefix),
        );
        for (let i = 0; i < relevant.length; i += maxConcurrentReads) {
          // Drain the whole batch even on failure so a retry cannot overlap
          // requests (including cache chunks) left behind by the failed load.
          const results = await Promise.allSettled(
            relevant.slice(i, i + maxConcurrentReads).map(async (key) => {
              const value = await storage.getItem(key);
              if (key.startsWith(cachePrefix)) {
                const cache = await loadCache(value);
                if (cache) caches.push(cache);
              } else
                marks[decodeURIComponent(key.slice(markPrefix.length))] =
                  readMarks(value);
            }),
          );
          const failure = results.find(
            (result) => result.status === "rejected",
          );
          if (failure) throw failure.reason;
        }
        return {
          caches,
          marks,
          preferences: preferences(await storage.getItem(prefKey)),
        };
      });
    },
    saveCache(cache: FeedCache) {
      return serial(async () => {
        const key = cachePrefix + encodeURIComponent(cache.feed.url);
        const previous = await storage.getItem(key);
        const oldChunks = chunkKeys(previous);
        if (!oldChunks) readCache(previous);
        // The host caps each data request at 256 KiB. Even worst-case JSON
        // escaping fits in that limit for a 24 Ki-character chunk.
        const source = JSON.stringify(cache),
          generation = crypto.randomUUID();
        const chunks: string[] = [];
        try {
          for (let start = 0; start < source.length; start += 24 * 1024) {
            const partKey = `${chunkPrefix}${generation}:${chunks.length}`;
            chunks.push(partKey);
            await storage.setItem(
              partKey,
              source.slice(start, start + 24 * 1024),
            );
          }
          // Publish only after every chunk is safely stored. A failed update
          // leaves the previous complete snapshot available after restart.
          await storage.setItem(key, { version: 2, chunks });
        } catch (error) {
          for (const part of chunks)
            await storage.removeItem(part).catch(() => undefined);
          throw error;
        }
        for (const part of oldChunks ?? [])
          await storage.removeItem(part).catch(() => undefined);
      });
    },
    changeMarks(id: string, patch: Partial<Marks>) {
      return serial(async () => {
        const key = markPrefix + encodeURIComponent(id);
        const next = { ...readMarks(await storage.getItem(key)), ...patch };
        await storage.setItem(key, next);
        return next;
      });
    },
    savePreferences(value: Preferences) {
      return serial(() => storage.setItem(prefKey, value));
    },
  };
}
export type Repository = ReturnType<typeof repository>;
