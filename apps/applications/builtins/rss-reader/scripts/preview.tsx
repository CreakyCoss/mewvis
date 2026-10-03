// Explicit development adapter only. Production ui/main.tsx never imports this file.
import React from "react";
import { createRoot } from "react-dom/client";
import type { ApplicationBrowserHost } from "@mewvis/app-sdk/browser";
import type { ApplicationStorageValue } from "@mewvis/app-sdk/data";
import App from "../ui/App";
import "../../../../../packages/design-system/tokens.css";
import "../ui/styles.css";
import { demoFeeds, demoEntries, demoStorage } from "./fixtures";
import { httpUrl, record, string, type Feed } from "../ui/model";

const key = "mewvis-rss-design-preview-v1";
let demo: { feeds: Feed[]; values: Record<string, unknown> };
try {
  demo = JSON.parse(localStorage.getItem(key) || "null") ?? {
    feeds: structuredClone(demoFeeds),
    values: demoStorage(),
  };
} catch {
  demo = { feeds: structuredClone(demoFeeds), values: demoStorage() };
}
const save = () => localStorage.setItem(key, JSON.stringify(demo));
save();
let failFeed = false;
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
function opmlPreview(opml: string) {
  const xml = new DOMParser().parseFromString(opml, "application/xml");
  if (xml.querySelector("parsererror") || !xml.querySelector("opml"))
    throw new Error("OPML 文本无效");
  const next = new Map(demo.feeds.map((feed) => [feed.url, feed]));
  const added: Feed[] = [],
    changes: Feed[] = [],
    skipped: { title: string; reason: string }[] = [];
  let existedCount = 0;
  xml.querySelectorAll("outline[xmlUrl]").forEach((outline) => {
    const url = httpUrl(outline.getAttribute("xmlUrl")),
      name =
        outline.getAttribute("text") ||
        outline.getAttribute("title") ||
        "订阅源";
    if (!url) {
      skipped.push({ title: name, reason: "地址无效" });
      return;
    }
    const feed = {
      url,
      name,
      category:
        outline.parentElement?.tagName === "outline"
          ? outline.parentElement.getAttribute("text") || ""
          : "",
    };
    if (next.has(url)) {
      existedCount++;
      if (JSON.stringify(next.get(url)) !== JSON.stringify(feed))
        changes.push(feed);
    } else added.push(feed);
    next.set(url, feed);
  });
  return {
    feeds: [...next.values()],
    addedCount: added.length,
    existedCount,
    skippedCount: skipped.length,
    totalCount: next.size,
    added,
    changes,
    skipped,
  };
}
const host: ApplicationBrowserHost = {
  version: 1,
  getHost: () => ({
    theme: "light",
    application: {
      id: "@mewvis/rss-reader",
      name: "RSS 阅读器",
      version: "0.1.0",
    },
    tools: [],
  }),
  data: {
    version: 1,
    async request(request) {
      const params = record("params" in request ? request.params : {}),
        storageKey = string(params.key);
      let value: unknown = null;
      if (request.method === "storage.keys") value = Object.keys(demo.values);
      else if (request.method === "storage.getItem")
        value = demo.values[storageKey] ?? null;
      else if (request.method === "storage.setItem") {
        demo.values[storageKey] = params.value;
        save();
      } else if (request.method === "storage.removeItem") {
        delete demo.values[storageKey];
        save();
      } else
        return {
          ok: false,
          error: {
            code: "CAPABILITY_UNAVAILABLE",
            message: "预览不提供此能力",
          },
        };
      return { ok: true, value: value as ApplicationStorageValue };
    },
  },
  async executeTool<T>(name: string, args: Record<string, unknown> = {}) {
    let value: unknown;
    if (name === "rss_list")
      value = { feeds: demo.feeds, count: demo.feeds.length };
    else if (name === "rss_fetch") {
      if (failFeed && args.url === demoFeeds[1].url)
        throw new Error("示例：连接超时，请稍后重试。");
      const source = demoFeeds.findIndex((feed) => feed.url === args.url);
      value = {
        entries:
          source < 0
            ? [
                {
                  ...demoEntries[0],
                  guid: "new-article",
                  title: "欢迎来到你的新订阅",
                },
              ]
            : demoEntries.filter((entry) => entry.source === source),
      };
    } else if (name === "rss_check") {
      if (!httpUrl(args.url)) throw new Error("订阅地址无效");
      value = { ok: true, title: "我的新订阅", feedType: "rss", entryCount: 1 };
    } else if (name === "rss_add") {
      const feed = {
        url: httpUrl(args.url),
        name: string(args.name) || "我的新订阅",
        category: string(args.category),
      };
      if (!feed.url) throw new Error("订阅地址无效");
      if (!demo.feeds.some((f) => f.url === feed.url)) demo.feeds.push(feed);
      save();
      value = { added: feed };
    } else if (name === "rss_remove") {
      demo.feeds = demo.feeds.filter((feed) => feed.url !== args.url);
      save();
      value = {};
    } else if (name === "rss_update") {
      demo.feeds = demo.feeds.map((feed) =>
        feed.url === args.url
          ? {
              ...feed,
              name: string(args.name),
              category: string(args.category),
            }
          : feed,
      );
      save();
      value = {};
    } else if (name === "rss_opml_export")
      value = {
        opml: `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>我的订阅</title></head><body>\n${[
          ...new Set(demo.feeds.map((f) => f.category)),
        ]
          .map(
            (group) =>
              `<outline text="${escape(group)}">${demo.feeds
                .filter((f) => f.category === group)
                .map(
                  (feed) =>
                    `\n<outline text="${escape(feed.name)}" type="rss" xmlUrl="${escape(feed.url)}"/>`,
                )
                .join("")}\n</outline>`,
          )
          .join("\n")}\n</body></opml>`,
        feedCount: demo.feeds.length,
      };
    else if (name === "rss_opml_preview" || name === "rss_opml_import") {
      const result = opmlPreview(string(args.opml));
      value = result;
      if (name === "rss_opml_import") {
        demo.feeds = result.feeds;
        save();
      }
    } else throw new Error("预览未提供该工具");
    return { value: value as T, content: [], meta: {} };
  },
  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return { opened: true };
  },
  async writeClipboardText(text) {
    await navigator.clipboard.writeText(text);
  },
};
Object.assign(window, { mewvisApplication: host });
const root = document.createElement("div");
root.id = "rss-root";
document.body.append(root);
createRoot(root).render(
  <React.StrictMode>
    <App preview />
  </React.StrictMode>,
);
const controls = document.createElement("details");
controls.style.cssText =
  "position:fixed;bottom:4px;right:7px;z-index:40;font:11px system-ui;color:var(--muted-foreground);background:var(--card);border-radius:5px;padding:2px 5px";
controls.innerHTML =
  '<summary>预览状态</summary><div style="display:flex;gap:8px;padding:9px"><button data-demo="reset">恢复示例</button><button data-demo="empty">空阅读器</button><button data-demo="failure">模拟单源失败</button><button data-demo="theme">切换主题</button></div>';
controls.addEventListener("click", (event) => {
  const action = (event.target as HTMLElement).dataset.demo;
  if (action === "reset") {
    localStorage.removeItem(key);
    location.reload();
  }
  if (action === "empty") {
    demo = { feeds: [], values: {} };
    save();
    location.reload();
  }
  if (action === "failure") {
    failFeed = !failFeed;
    (event.target as HTMLElement).textContent = failFeed
      ? "恢复正常同步"
      : "模拟单源失败";
  }
  if (action === "theme") document.documentElement.classList.toggle("dark");
});
document.body.append(controls);
