import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createApplicationDataClient } from "@mewvis/app-sdk/data";
import { normalizeArticles } from "../ui/model.ts";
import { repository } from "../ui/repository.ts";

function hostStorage() {
  const values = new Map();
  let active = 0,
    peak = 0,
    rejected = 0,
    failKey;
  const { storage } = createApplicationDataClient({
    version: 1,
    async request({ method, params = {} }) {
      // Match ApplicationFrame's four-request limit, with asynchronous I/O.
      if (active >= 4) {
        rejected++;
        return {
          ok: false,
          error: {
            code: "INVALID_ARGUMENT",
            message: "应用数据请求重复或并发请求过多",
          },
        };
      }
      active++;
      peak = Math.max(peak, active);
      try {
        if (method === "storage.getItem" && params.key === failKey) {
          failKey = undefined;
          return {
            ok: false,
            error: { code: "STORAGE_ERROR", message: "磁盘读取失败" },
          };
        }
        await setImmediate();
        let value = null;
        if (method === "storage.keys") value = [...values.keys()];
        else if (method === "storage.getItem")
          value = values.get(params.key) ?? null;
        else if (method === "storage.setItem")
          values.set(params.key, structuredClone(params.value));
        else if (method === "storage.removeItem") values.delete(params.key);
        else throw new Error(`Unexpected method: ${method}`);
        return { ok: true, value };
      } finally {
        active--;
      }
    },
  });
  return {
    storage,
    values,
    failOnce(key) {
      failKey = key;
    },
    get active() {
      return active;
    },
    get peak() {
      return peak;
    },
    get rejected() {
      return rejected;
    },
  };
}

function cache(index) {
  const feed = {
    url: `https://example.com/${index}/feed`,
    name: `Feed ${index}`,
    category: "Tests",
  };
  return {
    version: 1,
    feed,
    articles: normalizeArticles(
      [
        {
          guid: "one",
          title: `Article ${index}`,
          content: "正文".repeat(14000),
        },
      ],
      feed,
      100,
    ),
    updated: index + 1,
  };
}

test("five saved feeds and reading marks reload within the host data limit", async () => {
  const host = hostStorage();
  const writer = repository(host.storage);
  const caches = Array.from({ length: 5 }, (_, index) => cache(index));
  const marks = Object.fromEntries(
    caches.map((item) => [
      item.articles[0].id,
      { read: true, later: false, starred: true },
    ]),
  );
  for (const item of caches) await writer.saveCache(item);
  for (const [id, mark] of Object.entries(marks))
    await writer.changeMarks(id, mark);
  await writer.savePreferences({ fontSize: 17, sort: "oldest" });
  // Keep one legacy cache alongside the current chunked format.
  host.values.set(
    `rss:feed:v1:${encodeURIComponent(caches[4].feed.url)}`,
    caches[4],
  );

  const repo = repository(host.storage);
  const [loaded] = await Promise.all([
    repo.load(),
    repo.changeMarks("new mark", { later: true }),
    repo.saveCache({ ...caches[0], updated: 20 }),
    repo.savePreferences({ fontSize: 18, sort: "newest" }),
  ]);
  assert.deepEqual(
    loaded.caches.sort((a, b) => a.updated - b.updated),
    caches,
  );
  assert.deepEqual(loaded.marks, marks);
  assert.deepEqual(loaded.preferences, { fontSize: 17, sort: "oldest" });
  const reloaded = await repository(host.storage).load();
  assert.equal(
    reloaded.caches.find((item) => item.feed.url === caches[0].feed.url)
      .updated,
    20,
  );
  assert.equal(reloaded.marks["new mark"].later, true);
  assert.deepEqual(reloaded.preferences, { fontSize: 18, sort: "newest" });
  assert.equal(host.rejected, 0);
  assert.ok(host.peak <= 4);
  assert.equal(host.active, 0);
});

test("failed loads drain pending reads before an immediate retry", async () => {
  const host = hostStorage();
  const caches = Array.from({ length: 4 }, (_, index) => cache(index));
  const writer = repository(host.storage);
  for (const item of caches) await writer.saveCache(item);
  host.failOnce(`rss:feed:v1:${encodeURIComponent(caches[0].feed.url)}`);
  await assert.rejects(repository(host.storage).load(), /磁盘读取失败/);
  assert.equal(
    host.active,
    0,
    "A failed load must finish its other cache reads before returning.",
  );
  const reloaded = await repository(host.storage).load();
  assert.deepEqual(
    reloaded.caches.sort((a, b) => a.updated - b.updated),
    caches,
  );
  assert.equal(host.rejected, 0);
  assert.equal(host.active, 0);
});
