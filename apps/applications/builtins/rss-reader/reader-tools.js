import { XMLParser, XMLBuilder } from "fast-xml-parser";
import {
  buildRssTools,
  createProxyFetch,
  parseFeedsYaml,
  serializeFeeds,
  parseOpml,
  importOpmlFeeds,
} from "dsh-rss";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => name === "item" || name === "entry",
});
const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});
const text = (value) =>
  typeof value === "string"
    ? value
    : typeof value?.["#text"] === "string"
      ? value["#text"]
      : "";
function markup(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (value["#text"]) return text(value);
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => !key.startsWith("@_")),
  );
  return Object.keys(body).length ? builder.build(body) : "";
}

export function enrichFeed(result, xml) {
  // Upstream text fields remain unchanged; HTML is an additional untrusted field.
  // Never fetch an article website or a remote image as a side effect of reading.
  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return result;
    const doc = parser.parse(xml);
    const items =
      doc.rss?.channel?.item ?? doc.RDF?.item ?? doc.feed?.entry ?? [];
    let budget = 256 * 1024;
    return {
      ...result,
      entries: result.entries.map((entry, index) => {
        const raw = items[index];
        if (!raw || budget <= 0) return entry;
        const html = markup(
          raw.encoded || raw.content || raw.description || raw.summary,
        );
        if (!/<[a-z][\s\S]*>/i.test(html)) return entry;
        const bounded = html.slice(0, Math.min(20000, Math.floor(budget / 3)));
        budget -= Buffer.byteLength(bounded);
        return { ...entry, contentHtml: bounded };
      }),
    };
  } catch {
    return result;
  }
}

const objectResult = {
  schema: { type: "object", additionalProperties: true },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
};
const params = (properties) => ({
  type: "object",
  properties,
  additionalProperties: false,
});
export function buildReaderTools(config, scope, fetchImpl) {
  const fetcher =
    fetchImpl ??
    (config.proxyUrl ? createProxyFetch(config.proxyUrl) : globalThis.fetch);
  const definitions = buildRssTools(config, scope, fetcher);
  const original = definitions.find((tool) => tool.name === "rss_fetch");
  const tools = definitions.map((tool) =>
    tool === original
      ? {
          ...tool,
          async execute(args) {
            let xml = "";
            const capture = async (url, options) => {
              const response = await fetcher(url, options);
              return {
                ok: response.ok,
                status: response.status,
                url: response.url,
                async arrayBuffer() {
                  const chunks = [];
                  let size = 0;
                  const reader = response.body?.getReader();
                  if (!reader) return new ArrayBuffer(0);
                  try {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      size += value.byteLength;
                      if (size > config.maxBodyBytes) {
                        await reader.cancel();
                        throw new Error("订阅源内容超过大小上限");
                      }
                      chunks.push(value);
                    }
                  } finally {
                    reader.releaseLock();
                  }
                  const bytes = Buffer.concat(chunks);
                  xml = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
                  return bytes.buffer.slice(
                    bytes.byteOffset,
                    bytes.byteOffset + bytes.byteLength,
                  );
                },
              };
            };
            const requestTool = buildRssTools(config, scope, capture).find(
              (item) => item.name === "rss_fetch",
            );
            return enrichFeed(await requestTool.execute(args), xml);
          },
        }
      : tool,
  );
  tools.push(
    {
      name: "rss_update",
      risk: "medium",
      description: "修改已有订阅的名称和分类，不抓取网络内容。",
      parameters: {
        ...params({
          url: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
        }),
        required: ["url", "name", "category"],
      },
      output: objectResult,
      async execute(args) {
        if (
          !args ||
          !["url", "name", "category"].every(
            (key) => typeof args[key] === "string",
          )
        )
          throw new Error("地址、名称和分类必须是文本");
        const feeds = parseFeedsYaml(scope.get().feedsYaml);
        const current = feeds.find((feed) => feed.url === args.url);
        if (!current) throw new Error("该订阅已不存在，请刷新列表");
        const name = args.name.trim(),
          category = args.category.trim();
        if (!name || name.length > 160 || category.length > 80)
          throw new Error("名称为必填且不超过 160 字，分类不超过 80 字");
        const updated = { ...current, name, category };
        await scope.update({
          feedsYaml: serializeFeeds(
            feeds.map((feed) => (feed === current ? updated : feed)),
          ),
        });
        return { updated };
      },
    },
    {
      name: "rss_opml_preview",
      risk: "low",
      description: "预览 OPML 导入将新增、更新或跳过的订阅；不修改数据。",
      parameters: {
        ...params({ opml: { type: "string" } }),
        required: ["opml"],
      },
      output: objectResult,
      execute(args) {
        if (
          typeof args?.opml !== "string" ||
          !args.opml.trim() ||
          Buffer.byteLength(args.opml) > 1024 * 1024
        )
          throw new Error("请提供 1 MiB 以内的 OPML 文本");
        const feeds = parseFeedsYaml(scope.get().feedsYaml);
        const outcome = importOpmlFeeds(feeds, parseOpml(args.opml));
        const previous = new Map(feeds.map((feed) => [feed.url, feed]));
        const changes = outcome.feeds.filter(
          (feed) =>
            previous.has(feed.url) &&
            JSON.stringify(previous.get(feed.url)) !== JSON.stringify(feed),
        );
        return {
          addedCount: outcome.addedCount,
          existedCount: outcome.existedCount,
          skippedCount: outcome.skippedCount,
          totalCount: outcome.feeds.length,
          added: outcome.added,
          skipped: outcome.skipped,
          changes,
        };
      },
    },
  );
  return tools;
}
