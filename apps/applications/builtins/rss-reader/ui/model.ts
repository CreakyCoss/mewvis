export type Feed = { url: string; name: string; category: string };
export type Article = {
  id: string;
  feedUrl: string;
  source: string;
  title: string;
  link: string;
  author: string;
  published: string;
  summary: string;
  content: string;
  contentHtml: string;
  received: number;
};
export type Marks = { read: boolean; later: boolean; starred: boolean };
export type MarkMap = Record<string, Marks>;
export type FeedCache = {
  version: 1;
  feed: Feed;
  articles: Article[];
  updated: number;
};
export type View = "today" | "unread" | "later" | "starred" | "all";
export type Preferences = { fontSize: number; sort: "newest" | "oldest" };
export const emptyMarks: Marks = { read: false, later: false, starred: false };
export const record = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
export const string = (x: unknown) => (typeof x === "string" ? x : "");
export function httpUrl(value: unknown, base?: string) {
  try {
    const url = new URL(string(value), base);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function normalizeFeeds(input: unknown): Feed[] {
  if (!Array.isArray(input)) throw new Error("订阅列表格式不正确，请重试。");
  const unique = new Map<string, Feed>();
  for (const raw of input) {
    const item = record(raw),
      url = httpUrl(item.url);
    if (url)
      unique.set(url, {
        url,
        name: string(item.name).trim() || new URL(url).hostname,
        category: string(item.category).trim(),
      });
  }
  return [...unique.values()];
}
export const articleId = (feedUrl: string, entry: Record<string, unknown>) =>
  JSON.stringify([
    feedUrl,
    string(entry.guid) ||
      httpUrl(entry.link, feedUrl) ||
      [string(entry.title), string(entry.pubDate || entry.pubDateRaw)].join(
        "\n",
      ),
  ]);
export function normalizeArticles(
  input: unknown,
  feed: Feed,
  now = Date.now(),
): Article[] {
  if (!Array.isArray(input))
    throw new Error("文章列表格式不正确，已保留之前的内容。");
  return [
    ...new Map(
      input.map((raw) => {
        const entry = record(raw);
        const rawDate = string(entry.pubDate || entry.pubDateRaw);
        const article: Article = {
          id: articleId(feed.url, entry),
          feedUrl: feed.url,
          source: feed.name,
          title: string(entry.title).trim() || "无标题文章",
          link: httpUrl(entry.link, feed.url),
          author: string(entry.author),
          published: Number.isFinite(Date.parse(rawDate))
            ? new Date(rawDate).toISOString()
            : "",
          summary: string(entry.summary).slice(0, 2000),
          content: string(entry.content).slice(0, 40000),
          contentHtml: string(entry.contentHtml).slice(0, 40000),
          received: now,
        };
        return [article.id, article] as const;
      }),
    ).values(),
  ];
}
export const timestamp = (article: Article) =>
  Date.parse(article.published) || article.received;
export function mergeArticles(
  previous: Article[],
  incoming: Article[],
  marks: MarkMap,
  limit = 300,
) {
  const map = new Map(previous.map((a) => [a.id, a]));
  for (const article of incoming)
    map.set(article.id, {
      ...article,
      received: map.get(article.id)?.received ?? article.received,
    });
  const ordered = [...map.values()].sort((a, b) => timestamp(b) - timestamp(a));
  return ordered.filter(
    (article, index) =>
      index < limit || marks[article.id]?.later || marks[article.id]?.starred,
  );
}
export function readCache(value: unknown): FeedCache | null {
  if (value === null) return null;
  const item = record(value);
  if (
    item.version !== 1 ||
    !Array.isArray(item.articles) ||
    typeof item.updated !== "number"
  )
    throw new Error("阅读缓存格式不正确，未覆盖原数据。");
  const feed = normalizeFeeds([item.feed])[0];
  if (!feed) throw new Error("订阅缓存缺少有效来源。");
  for (const article of item.articles) {
    const a = record(article);
    if (
      ![
        "id",
        "feedUrl",
        "source",
        "title",
        "link",
        "author",
        "published",
        "summary",
        "content",
        "contentHtml",
      ].every((k) => typeof a[k] === "string") ||
      typeof a.received !== "number"
    )
      throw new Error("文章缓存格式不正确，未覆盖原数据。");
  }
  return item as unknown as FeedCache;
}
export function readMarks(value: unknown): Marks {
  if (value === null) return { ...emptyMarks };
  const item = record(value);
  if (!["read", "later", "starred"].every((k) => typeof item[k] === "boolean"))
    throw new Error("阅读状态格式不正确，未覆盖原数据。");
  return {
    read: item.read as boolean,
    later: item.later as boolean,
    starred: item.starred as boolean,
  };
}
export const plainExcerpt = (article: Article) =>
  (article.summary || article.content)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const readingMinutes = (article: Article) =>
  Math.max(1, Math.ceil((article.content || article.summary).length / 450));
export function filterArticles(
  articles: Article[],
  marks: MarkMap,
  feeds: Feed[],
  view: View,
  feedUrl: string,
  query: string,
  sort: Preferences["sort"],
) {
  const active = new Set(feeds.map((feed) => feed.url));
  const term = query.trim().toLocaleLowerCase();
  return articles
    .filter((article) => {
      const mark = marks[article.id] ?? emptyMarks;
      if (
        view === "later"
          ? !mark.later
          : view === "starred"
            ? !mark.starred
            : !active.has(article.feedUrl) &&
              !(term && (mark.later || mark.starred))
      )
        return false;
      if (view === "unread" && mark.read) return false;
      if (feedUrl && article.feedUrl !== feedUrl) return false;
      return (
        !term ||
        [
          article.title,
          article.source,
          article.author,
          article.summary,
          article.content,
        ].some((text) => text.toLocaleLowerCase().includes(term))
      );
    })
    .sort(
      (a, b) => (timestamp(b) - timestamp(a)) * (sort === "newest" ? 1 : -1),
    );
}
export function preferences(value: unknown): Preferences {
  const item = record(value);
  return {
    fontSize:
      typeof item.fontSize === "number"
        ? Math.min(24, Math.max(14, item.fontSize))
        : 16,
    sort: item.sort === "oldest" ? "oldest" : "newest",
  };
}
