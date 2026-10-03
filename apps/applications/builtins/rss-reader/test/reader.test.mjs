import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeArticles,
  mergeArticles,
  filterArticles,
  readCache,
  readMarks,
} from "../ui/model.ts";
import { repository } from "../ui/repository.ts";
import { buildReaderTools, enrichFeed } from "../reader-tools.js";
import { resolveConfig, serializeFeeds, parseFeedsYaml } from "dsh-rss";

const feed = {
  url: "https://example.com/feed",
  name: "Source",
  category: "Tech",
};
const another = { ...feed, url: "https://example.org/feed" };
const entries = [
  {
    guid: "stable",
    title: "Original",
    link: "https://example.com/1",
    pubDate: "2026-10-03T01:00:00Z",
    summary: "first",
  },
];
test("refreshes retain stable identities; identical GUIDs from different sources do not collide", () => {
  const old = normalizeArticles(entries, feed, 100);
  const incoming = normalizeArticles(
    [{ ...entries[0], title: "Edited" }],
    feed,
    200,
  );
  const merged = mergeArticles(old, incoming, {});
  assert.equal(merged.length, 1);
  assert.equal(merged[0].received, 100);
  assert.equal(merged[0].title, "Edited");
  assert.notEqual(normalizeArticles(entries, another)[0].id, old[0].id);
});
test("retention preserves saved articles; unsubscribe removes them from inbox but keeps saved views", () => {
  const all = normalizeArticles(
    Array.from({ length: 5 }, (_, i) => ({
      guid: String(i),
      title: String(i),
      pubDate: `2026-10-0${i + 1}`,
    })),
    feed,
  );
  const marks = { [all[0].id]: { read: false, later: true, starred: true } };
  assert.equal(mergeArticles(all, [], marks, 2).length, 3);
  assert.equal(
    filterArticles(all, marks, [], "unread", "", "", "newest").length,
    0,
  );
  assert.equal(
    filterArticles(all, marks, [], "later", "", "", "newest").length,
    1,
  );
  assert.equal(
    filterArticles(all, marks, [], "all", "", "0", "newest").length,
    1,
  );
});
test("search, source and read filters compose", () => {
  const all = [
    ...normalizeArticles(entries, feed),
    ...normalizeArticles(entries, another),
  ];
  const marks = { [all[0].id]: { read: true, later: false, starred: false } };
  assert.equal(
    filterArticles(
      all,
      marks,
      [feed, another],
      "unread",
      "",
      "Original",
      "newest",
    )[0].feedUrl,
    another.url,
  );
  assert.equal(
    filterArticles(
      all,
      marks,
      [feed, another],
      "all",
      feed.url,
      "first",
      "newest",
    ).length,
    1,
  );
});
test("invalid storage is rejected instead of resetting saved data", () => {
  assert.throws(
    () => readCache({ version: 1, articles: [{}], updated: 0, feed }),
    /缓存格式/,
  );
  assert.throws(() => readMarks({ read: "yes" }), /状态格式/);
});
test("queued writes merge different flags and failures do not poison subsequent writes", async () => {
  const values = new Map();
  let fail = false;
  const storage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async keys() {
      return [...values.keys()];
    },
    async setItem(key, value) {
      await new Promise((r) => setTimeout(r, 5));
      if (fail) {
        fail = false;
        throw new Error("disk full");
      }
      values.set(key, structuredClone(value));
    },
  };
  const repo = repository(storage);
  await Promise.all([
    repo.changeMarks("article", { read: true }),
    repo.changeMarks("article", { starred: true }),
  ]);
  assert.deepEqual((await repo.load()).marks.article, {
    read: true,
    starred: true,
    later: false,
  });
  fail = true;
  await assert.rejects(
    repo.changeMarks("article", { later: true }),
    /disk full/,
  );
  assert.equal((await repo.load()).marks.article.later, false);
  await repo.changeMarks("article", { later: true });
  assert.equal((await repository(storage).load()).marks.article.later, true);
});
test("large caches respect the host payload limit and interrupted writes retain the previous snapshot", async () => {
  const values = new Map();
  let writesBeforeFailure = Infinity;
  const storage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async keys() {
      return [...values.keys()];
    },
    async removeItem(key) {
      values.delete(key);
    },
    async setItem(key, value) {
      assert.ok(
        Buffer.byteLength(
          JSON.stringify({ method: "storage.setItem", params: { key, value } }),
        ) <
          256 * 1024,
      );
      if (--writesBeforeFailure === 0) throw new Error("storage interrupted");
      values.set(key, structuredClone(value));
    },
  };
  const repo = repository(storage);
  const cache = {
    version: 1,
    feed,
    updated: 1,
    articles: normalizeArticles(
      Array.from({ length: 40 }, (_, i) => ({
        guid: String(i),
        title: `Long article ${i}`,
        content: '中文正文\\"\n'.repeat(4000),
      })),
      feed,
      100,
    ),
  };
  await repo.saveCache(cache);
  assert.deepEqual((await repository(storage).load()).caches, [cache]);
  const originalKeys = [...values.keys()].sort();
  writesBeforeFailure = 3;
  await assert.rejects(repo.saveCache({ ...cache, updated: 2 }), /interrupted/);
  assert.deepEqual((await repository(storage).load()).caches, [cache]);
  assert.deepEqual([...values.keys()].sort(), originalKeys);
  writesBeforeFailure = Infinity;
  await repo.saveCache({ ...cache, updated: 3 });
  assert.equal((await repository(storage).load()).caches[0].updated, 3);
  assert.ok(
    originalKeys
      .filter((key) => key.startsWith("rss:cache-part:"))
      .every((key) => !values.has(key)),
  );
});
test("RSS and escaped Atom HTML preserve structure in an additional field", () => {
  const base = { entries: [{ summary: "text" }] };
  assert.equal(
    enrichFeed(
      base,
      "<rss><channel><item><description><![CDATA[<h2>Title</h2><p>Text</p>]]></description></item></channel></rss>",
    ).entries[0].contentHtml,
    "<h2>Title</h2><p>Text</p>",
  );
  assert.equal(
    enrichFeed(
      base,
      '<feed><entry><content type="html">&lt;p&gt;Atom&lt;/p&gt;</content></entry></feed>',
    ).entries[0].contentHtml,
    "<p>Atom</p>",
  );
  assert.equal(enrichFeed(base, "<!DOCTYPE rss><rss/>"), base);
});
test("rich fetch uses one bounded request and preserves upstream text contract", async () => {
  let requests = 0;
  const scope = {
    get: () => ({ feedsYaml: serializeFeeds([feed]) }),
    update: async () => {},
  };
  const xml =
    '<rss version="2.0"><channel><title>Source</title><item><guid>1</guid><title>One</title><description><![CDATA[<p>Rich <strong>text</strong>.</p>]]></description></item></channel></rss>';
  const tools = buildReaderTools(resolveConfig({}), scope, async () => {
    requests++;
    return new Response(xml);
  });
  const result = await tools
    .find((t) => t.name === "rss_fetch")
    .execute({ url: feed.url });
  assert.equal(requests, 1);
  assert.match(result.entries[0].summary, /^Rich text/);
  assert.match(result.entries[0].contentHtml, /<strong>/);
  const limited = buildReaderTools(
    { ...resolveConfig({}), maxBodyBytes: 8 },
    scope,
    async () => new Response(xml),
  );
  await assert.rejects(
    limited.find((t) => t.name === "rss_fetch").execute({ url: feed.url }),
    /大小上限/,
  );
});
test("OPML preview is read only and subscription edit preserves source URL", async () => {
  let feedsYaml = serializeFeeds([feed]),
    writes = 0;
  const scope = {
    get: () => ({ feedsYaml }),
    update: async (patch) => {
      writes++;
      feedsYaml = patch.feedsYaml;
    },
  };
  const tools = buildReaderTools(resolveConfig({}), scope);
  const preview = await tools
    .find((t) => t.name === "rss_opml_preview")
    .execute({
      opml: '<opml version="2.0"><body><outline text="New group"><outline text="Renamed" type="rss" xmlUrl="https://example.com/feed"/><outline text="Added" type="rss" xmlUrl="https://new.example.com/rss"/></outline></body></opml>',
    });
  assert.equal(writes, 0);
  assert.equal(preview.addedCount, 1);
  assert.equal(preview.changes.length, 1);
  await tools
    .find((t) => t.name === "rss_update")
    .execute({ url: feed.url, name: "Renamed", category: "Books" });
  assert.deepEqual(parseFeedsYaml(feedsYaml), [
    { ...feed, name: "Renamed", category: "Books" },
  ]);
});
