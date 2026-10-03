import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  ExternalLink,
  Globe2,
  Inbox,
  Menu,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  Star,
  Type,
  X,
} from "lucide-react";
import { getApplicationHost } from "@mewvis/app-sdk/browser";
import readingDesk from "../assets/reading-desk.png";
import {
  emptyMarks,
  filterArticles,
  plainExcerpt,
  readingMinutes,
  type Article,
  type View,
  type Marks,
} from "./model";
import { useReader, errorText } from "./useReader";
import { articleHtml } from "./content";
import { Dialog } from "./Dialog";
import { Subscriptions } from "./Subscriptions";

const viewNames: Record<View, string> = {
  today: "今日阅读",
  unread: "全部未读",
  later: "稍后读",
  starred: "我的收藏",
  all: "全部文章",
};
function dateText(article: Article) {
  if (!article.published) return "日期未知";
  const date = new Date(article.published),
    today = new Date();
  return date.toLocaleDateString() === today.toLocaleDateString()
    ? date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
function ReaderBody({
  article,
  fontSize,
  openExternal,
}: {
  article: Article;
  fontSize: number;
  openExternal: (url: string) => void;
}) {
  const html = useMemo(() => articleHtml(article), [article]);
  return (
    <div
      className="article-prose"
      style={{ fontSize }}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[href]",
        );
        if (link) {
          event.preventDefault();
          openExternal(link.href);
        }
      }}
      dangerouslySetInnerHTML={{
        __html: html || "<p>该条目没有提供正文或摘要，可打开原文继续阅读。</p>",
      }}
    />
  );
}
export default function App({ preview = false }: { preview?: boolean }) {
  const reader = useReader();
  const { feeds, caches, marks, prefs, loading, failed, syncing, pending } =
    reader;
  const [view, setView] = useState<View>("today"),
    [feedUrl, setFeedUrl] = useState(""),
    [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(""),
    [queue, setQueue] = useState<string[]>([]);
  const [mobileNav, setMobileNav] = useState(false),
    [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [manage, setManage] = useState<"add" | "manage" | null>(null),
    [settings, setSettings] = useState(false);
  const [toast, setToast] = useState<{
      text: string;
      undo?: () => Promise<void>;
    } | null>(null),
    [bulk, setBulk] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    listScroll = useRef(0),
    search = useRef<HTMLInputElement>(null);
  const articles = useMemo(
    () =>
      caches.flatMap((cache) =>
        cache.articles.map((article) => ({
          ...article,
          source:
            feeds.find((feed) => feed.url === article.feedUrl)?.name ??
            article.source,
        })),
      ),
    [caches, feeds],
  );
  const counts = useMemo(
    () => ({
      unread: filterArticles(articles, marks, feeds, "unread", "", "", "newest")
        .length,
      later: articles.filter((a) => marks[a.id]?.later).length,
      starred: articles.filter((a) => marks[a.id]?.starred).length,
    }),
    [articles, marks, feeds],
  );
  const visible = useMemo(
    () =>
      filterArticles(
        articles,
        marks,
        feeds,
        query.trim() ? "all" : view,
        feedUrl,
        query,
        prefs.sort,
      ),
    [articles, marks, feeds, view, feedUrl, query, prefs.sort],
  );
  const selected = articles.find((a) => a.id === selectedId);
  const selectedMark = selected
    ? (marks[selected.id] ?? emptyMarks)
    : emptyMarks;
  const title = query.trim()
    ? "搜索结果"
    : feedUrl
      ? (feeds.find((f) => f.url === feedUrl)?.name ?? "订阅文章")
      : viewNames[view];
  const isToday = view === "today" && !feedUrl && !query.trim();
  const featured = isToday
    ? (visible.find((a) => !marks[a.id]?.read) ?? visible[0])
    : undefined;
  const groups = [...new Set(feeds.map((f) => f.category || "未分组"))];
  const failedSources = feeds.filter((feed) => reader.feedErrors[feed.url]);
  const openExternal = async (url: string) => {
    try {
      await getApplicationHost().openExternal(url);
    } catch (cause) {
      reader.setError(errorText(cause));
    }
  };
  const navigate = (next: View, source = "") => {
    setView(next);
    setFeedUrl(source);
    setQuery("");
    setSelectedId("");
    setMobileNav(false);
    scroll.current?.scrollTo({ top: 0 });
  };
  const openArticle = (article: Article, newQueue = true) => {
    if (!selected) listScroll.current = scroll.current?.scrollTop ?? 0;
    if (newQueue) setQueue(visible.map((a) => a.id));
    setSelectedId(article.id);
    scroll.current?.scrollTo({ top: 0 });
    if (!marks[article.id]?.read)
      void reader.changeMarks(article.id, { read: true });
  };
  const goBack = () => {
    setSelectedId("");
    requestAnimationFrame(() =>
      scroll.current?.scrollTo({ top: listScroll.current }),
    );
  };
  const nextArticle = (direction = 1) => {
    const next = articles.find(
      (a) => a.id === queue[queue.indexOf(selectedId) + direction],
    );
    if (next) openArticle(next, false);
  };
  const toggle = async (article: Article, field: keyof Marks) => {
    const previous = marks[article.id]?.[field] ?? false;
    if (await reader.changeMarks(article.id, { [field]: !previous }))
      setToast({
        text:
          field === "later"
            ? previous
              ? "已移出稍后读"
              : "已加入稍后读"
            : field === "starred"
              ? previous
                ? "已取消收藏"
                : "已收藏文章"
              : previous
                ? "已标记未读"
                : "已标记已读",
        undo: async () => {
          await reader.changeMarks(article.id, { [field]: previous });
          setToast(null);
        },
      });
  };
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search.current?.focus();
        return;
      }
      if (
        target.closest("input,textarea,select,[contenteditable=true]") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key === "Escape") {
        if (selected) goBack();
        else setMobileNav(false);
      }
      if (!selected) return;
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        nextArticle(1);
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        nextArticle(-1);
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void toggle(selected, "starred");
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        void toggle(selected, "read");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });
  const markAll = async () => {
    setBulk(true);
    const unread = visible.filter((a) => !marks[a.id]?.read);
    const changed: string[] = [];
    try {
      for (const article of unread)
        if (await reader.changeMarks(article.id, { read: true }))
          changed.push(article.id);
      setToast({
        text: `已将 ${changed.length} 篇文章标记已读`,
        undo: async () => {
          for (const id of changed)
            await reader.changeMarks(id, { read: false });
          setToast(null);
        },
      });
    } finally {
      setBulk(false);
    }
  };
  const ArticleRow = ({ article }: { article: Article }) => {
    const mark = marks[article.id] ?? emptyMarks;
    return (
      <div className={`article-row ${mark.read ? "is-read" : ""}`}>
        <button
          className="article-row-main"
          onClick={() => openArticle(article)}
          aria-label={`阅读：${article.title}`}
        >
          <span className="row-source">
            <span
              className={`unread-dot ${mark.read ? "read" : ""}`}
              aria-label={mark.read ? "已读" : "未读"}
            />
            {article.source}
            <span className="row-date"> · {dateText(article)}</span>
          </span>
          <span className="row-copy">
            <strong>{article.title}</strong>
            <span>{plainExcerpt(article) || "打开文章，慢慢阅读。"}</span>
          </span>
          <span className="read-time">约 {readingMinutes(article)} 分钟</span>
        </button>
        <button
          className={`icon-button save-button ${mark.later ? "is-saved" : ""}`}
          aria-label={`${mark.later ? "移出" : "加入"}稍后读：${article.title}`}
          aria-pressed={mark.later}
          disabled={pending.has(article.id)}
          onClick={() => void toggle(article, "later")}
        >
          <Bookmark size={20} />
        </button>
      </div>
    );
  };
  return (
    <main className="rss-app">
      {mobileNav && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        className={`rss-sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="阅读导航"
      >
        <button className="app-brand" onClick={() => navigate("today")}>
          <Rss size={27} strokeWidth={2.5} />
          <span>RSS 阅读器</span>
        </button>
        <nav className="main-nav">
          {(
            [
              { id: "today", icon: BookOpen },
              { id: "unread", icon: Inbox },
              { id: "later", icon: Clock3 },
              { id: "starred", icon: Star },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={view === item.id && !feedUrl ? "active" : ""}
              aria-current={view === item.id && !feedUrl ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={21} />
              <span>{viewNames[item.id]}</span>
              {item.id !== "today" && (
                <span className="nav-count">{counts[item.id]}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sources-nav">
          <div className="section-label">订阅源</div>
          {groups.map((group) => (
            <section className="feed-group" key={group}>
              <button
                className="group-heading"
                aria-expanded={!closedGroups.has(group)}
                onClick={() =>
                  setClosedGroups((old) => {
                    const next = new Set(old);
                    if (next.has(group)) next.delete(group);
                    else next.add(group);
                    return next;
                  })
                }
              >
                <ChevronDown
                  size={15}
                  className={closedGroups.has(group) ? "collapsed" : ""}
                />
                <span>{group}</span>
              </button>
              {!closedGroups.has(group) &&
                feeds
                  .filter((feed) => (feed.category || "未分组") === group)
                  .map((feed) => (
                    <button
                      className={`feed-link ${feedUrl === feed.url ? "active" : ""}`}
                      key={feed.url}
                      title={reader.feedErrors[feed.url] || feed.name}
                      onClick={() => navigate("all", feed.url)}
                    >
                      <Globe2 size={17} />
                      <span>{feed.name}</span>
                      {reader.feedErrors[feed.url] ? (
                        <span className="feed-failure" aria-label="更新失败">
                          !
                        </span>
                      ) : (
                        <small>
                          {articles.filter(
                            (a) => a.feedUrl === feed.url && !marks[a.id]?.read,
                          ).length || ""}
                        </small>
                      )}
                    </button>
                  ))}
            </section>
          ))}
          {!feeds.length && (
            <p className="sidebar-empty">
              把喜欢的博客和周刊，
              <br />
              放进同一个阅读空间。
            </p>
          )}
        </div>
        <footer className="sidebar-footer">
          <button
            className="add-subscription"
            disabled={failed || loading || syncing}
            onClick={() => setManage("add")}
          >
            <Plus size={20} />
            添加订阅
          </button>
          <button
            className="manage-link"
            disabled={failed || loading}
            onClick={() => setManage("manage")}
          >
            <Settings2 size={18} />
            管理订阅 / OPML
          </button>
          <button
            className="sync-link"
            disabled={syncing || loading || failed || !feeds.length}
            aria-label="刷新全部订阅"
            onClick={() => void reader.sync()}
          >
            <RefreshCw size={14} className={syncing ? "spinning" : ""} />
            <span>
              {syncing
                ? `正在更新 ${reader.progress.done}/${reader.progress.total}`
                : `${feeds.length} 个订阅 · ${caches.some((c) => feeds.some((f) => f.url === c.feed.url)) ? "已缓存" : "等待更新"}`}
            </span>
          </button>
        </footer>
      </aside>
      <section className="rss-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="展开阅读导航"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            {selected ? (
              <button className="back-link" onClick={goBack}>
                <ArrowLeft size={18} />
                {title}
              </button>
            ) : (
              <>
                <span>我的阅读</span>
                <span className="breadcrumb-slash">/</span>
                <strong>{title}</strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            <label className="global-search">
              <Search size={18} />
              <input
                ref={search}
                placeholder="搜索文章或订阅"
                aria-label="搜索已缓存文章或订阅"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFeedUrl("");
                  setSelectedId("");
                }}
              />
              {query ? (
                <button
                  className="clear-search"
                  aria-label="清除搜索"
                  onClick={() => setQuery("")}
                >
                  <X size={16} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
            </label>
            {preview && <span className="preview-label">示例预览</span>}
          </div>
        </header>
        <div className="main-scroll" ref={scroll}>
          {reader.error && (
            <div className="notice error page-notice" role="alert">
              <span>{reader.error}</span>
              {failed ? (
                <button onClick={() => void reader.retry()}>重新加载</button>
              ) : (
                <button
                  aria-label="关闭错误提示"
                  onClick={() => reader.setError("")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {failedSources.length > 0 && !failed && (
            <div className="notice warning page-notice" role="status">
              <span>
                {failedSources.length} 个订阅未能更新，仍可阅读缓存内容。
              </span>
              <button onClick={() => setManage("manage")}>查看详情</button>
              <button
                disabled={syncing}
                onClick={() => void reader.sync(failedSources)}
              >
                重试
              </button>
            </div>
          )}
          {loading ? (
            <div className="page-empty" role="status">
              <RefreshCw className="spinning" size={28} />
              <h2>正在打开阅读空间</h2>
              <p>读取订阅与上次的阅读状态…</p>
            </div>
          ) : failed ? (
            <div className="page-empty">
              <Inbox size={36} />
              <h2>暂时无法打开阅读空间</h2>
              <p>原有数据不会被覆盖。恢复宿主连接后重试。</p>
              <button
                className="primary-button"
                onClick={() => void reader.retry()}
              >
                重新加载
              </button>
            </div>
          ) : selected ? (
            <>
              <div className="reader-toolbar">
                <span className="reader-source">{selected.source}</span>
                <div>
                  <button
                    className={`secondary-button ${selectedMark.later ? "is-saved" : ""}`}
                    aria-pressed={selectedMark.later}
                    disabled={pending.has(selected.id)}
                    onClick={() => void toggle(selected, "later")}
                  >
                    <Bookmark size={17} />
                    {selectedMark.later ? "已在稍后读" : "稍后读"}
                  </button>
                  <button
                    className={`icon-button ${selectedMark.starred ? "is-saved" : ""}`}
                    aria-label={selectedMark.starred ? "取消收藏" : "收藏文章"}
                    aria-pressed={selectedMark.starred}
                    disabled={pending.has(selected.id)}
                    onClick={() => void toggle(selected, "starred")}
                  >
                    <Star size={20} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={selectedMark.read ? "标记未读" : "标记已读"}
                    disabled={pending.has(selected.id)}
                    onClick={() => void toggle(selected, "read")}
                  >
                    <Check size={20} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="阅读设置"
                    onClick={() => setSettings(true)}
                  >
                    <Type size={20} />
                  </button>
                </div>
              </div>
              <article className="reader-paper">
                <p className="reader-overline">{selected.source}</p>
                <h1>{selected.title}</h1>
                <p className="reader-meta">
                  {[
                    selected.author,
                    selected.published
                      ? new Date(selected.published).toLocaleString("zh-CN", {
                          dateStyle: "long",
                          timeStyle: "short",
                        })
                      : "发布日期未知",
                    `约 ${readingMinutes(selected)} 分钟`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="reader-origin">
                  <span>
                    {selected.content || selected.contentHtml
                      ? "订阅正文"
                      : "订阅摘要"}
                  </span>
                  {selected.link && (
                    <button
                      className="text-button"
                      onClick={() => void openExternal(selected.link)}
                    >
                      打开原文
                      <ExternalLink size={14} />
                    </button>
                  )}
                </div>
                <ReaderBody
                  article={selected}
                  fontSize={prefs.fontSize}
                  openExternal={(url) => void openExternal(url)}
                />
                <p className="reader-footnote">
                  内容由订阅源提供，图片及未收录内容可在原文查看。
                </p>
                <div className="reader-next">
                  <button className="secondary-button" onClick={goBack}>
                    <ArrowLeft size={16} />
                    回到列表
                  </button>
                  <button
                    className="primary-button"
                    disabled={queue.indexOf(selectedId) >= queue.length - 1}
                    onClick={() => nextArticle()}
                  >
                    下一篇
                    <ArrowRight size={17} />
                  </button>
                </div>
              </article>
            </>
          ) : (
            <div className="reading-home">
              <div className="page-intro">
                <div>
                  {isToday && (
                    <p className="today-date">{`${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}，${new Date().toLocaleDateString("zh-CN", { weekday: "long" })}`}</p>
                  )}
                  <h1>{isToday ? "今天，值得慢慢读。" : title}</h1>
                  <p>
                    {isToday
                      ? `${counts.unread} 篇未读，按你的订阅汇集。`
                      : query.trim()
                        ? `在已缓存内容中找到 ${visible.length} 篇文章`
                        : `${visible.length} 篇文章${view === "later" ? "，等你有空再读。" : view === "starred" ? "，留给值得回顾的时刻。" : ""}`}
                  </p>
                </div>
                <div className="list-controls">
                  <label className="sr-only" htmlFor="article-sort">
                    文章排序
                  </label>
                  <select
                    id="article-sort"
                    value={prefs.sort}
                    onChange={(e) =>
                      void reader.changePreferences({
                        ...prefs,
                        sort: e.target.value as "newest" | "oldest",
                      })
                    }
                  >
                    <option value="newest">最新优先</option>
                    <option value="oldest">最早优先</option>
                  </select>
                  {!isToday && visible.some((a) => !marks[a.id]?.read) && (
                    <button
                      className="text-button"
                      disabled={bulk}
                      onClick={() => void markAll()}
                    >
                      <CheckCheck size={17} />
                      {bulk ? "标记中…" : "全部已读"}
                    </button>
                  )}
                </div>
              </div>
              {query.trim() &&
                feeds.some((feed) =>
                  `${feed.name} ${feed.url}`
                    .toLowerCase()
                    .includes(query.trim().toLowerCase()),
                ) && (
                  <div className="matching-feeds">
                    <span>相关订阅</span>
                    {feeds
                      .filter((feed) =>
                        `${feed.name} ${feed.url}`
                          .toLowerCase()
                          .includes(query.trim().toLowerCase()),
                      )
                      .map((feed) => (
                        <button
                          className="secondary-button"
                          key={feed.url}
                          onClick={() => navigate("all", feed.url)}
                        >
                          <Rss size={15} />
                          {feed.name}
                          <ArrowRight size={14} />
                        </button>
                      ))}
                  </div>
                )}
              {!feeds.length &&
              !articles.some(
                (a) => marks[a.id]?.later || marks[a.id]?.starred,
              ) ? (
                <div className="page-empty">
                  <BookOpen size={42} />
                  <h2>给自己留一处阅读空间</h2>
                  <p>
                    添加博客、周刊或新闻的 RSS 地址，
                    <br />
                    在这里收集、阅读和留存。
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => setManage("add")}
                  >
                    <Plus size={18} />
                    添加第一个订阅
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setManage("manage")}
                  >
                    从 OPML 导入订阅
                    <ArrowRight size={15} />
                  </button>
                </div>
              ) : !visible.length ? (
                <div className="page-empty">
                  <CheckCheck size={40} />
                  <h2>
                    {syncing
                      ? "正在汇集新文章"
                      : query
                        ? "没有找到相关内容"
                        : view === "unread"
                          ? "未读都处理完了"
                          : view === "later"
                            ? "留些好文章，稍后再读"
                            : view === "starred"
                              ? "收藏值得再读的文章"
                              : "这里还没有文章"}
                  </h2>
                  <p>
                    {query
                      ? "试试标题、作者或来源名称，也可以清除搜索。"
                      : view === "later" || view === "starred"
                        ? "阅读时点一下收藏或稍后读，它们就会留在这里。"
                        : "看看其他订阅，或刷新获取最新内容。"}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => (query ? setQuery("") : navigate("all"))}
                  >
                    {query ? "清除搜索" : "查看全部文章"}
                  </button>
                </div>
              ) : (
                <>
                  {featured && (
                    <section
                      className="featured-article"
                      aria-label="今日主文章"
                    >
                      <div className="featured-copy">
                        <p className="featured-source">
                          {featured.source}
                          <span> · {dateText(featured)}</span>
                        </p>
                        <button
                          className="featured-title"
                          onClick={() => openArticle(featured)}
                        >
                          <h2>{featured.title}</h2>
                        </button>
                        <p className="featured-excerpt">
                          {plainExcerpt(featured)}
                        </p>
                        <p className="featured-meta">
                          {[
                            featured.author,
                            `约 ${readingMinutes(featured)} 分钟`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="featured-actions">
                          <button
                            className="primary-button"
                            onClick={() => openArticle(featured)}
                          >
                            开始阅读
                            <ArrowRight size={18} />
                          </button>
                          <button
                            className={`secondary-button ${marks[featured.id]?.later ? "is-saved" : ""}`}
                            disabled={pending.has(featured.id)}
                            aria-pressed={!!marks[featured.id]?.later}
                            onClick={() => void toggle(featured, "later")}
                          >
                            <Bookmark size={19} />
                            {marks[featured.id]?.later ? "已加入" : "稍后读"}
                          </button>
                        </div>
                      </div>
                      <img className="reading-photo" src={readingDesk} alt="" />
                    </section>
                  )}
                  <section className="article-list">
                    <header className="article-list-header">
                      <div className="list-heading">
                        <h2>
                          {isToday
                            ? "继续发现"
                            : query.trim()
                              ? "文章"
                              : "阅读列表"}
                        </h2>
                        {isToday && visible.length > 4 && (
                          <button
                            className="all-articles-link"
                            onClick={() => navigate("all")}
                          >
                            全部 {visible.length} 篇<ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                      <label className="source-filter">
                        <span className="sr-only">筛选订阅</span>
                        <select
                          value={feedUrl}
                          onChange={(e) => {
                            setFeedUrl(e.target.value);
                            if (isToday) setView("all");
                          }}
                        >
                          <option value="">全部订阅</option>
                          {feeds.map((feed) => (
                            <option key={feed.url} value={feed.url}>
                              {feed.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </header>
                    {(featured
                      ? visible.filter((a) => a.id !== featured.id).slice(0, 3)
                      : visible
                    ).map((article) => (
                      <ArticleRow key={article.id} article={article} />
                    ))}
                  </section>
                  {isToday && (
                    <button
                      className="later-banner"
                      onClick={() => navigate("later")}
                    >
                      <BookOpen size={31} strokeWidth={1.7} />
                      <span>
                        <strong>
                          {counts.later
                            ? `留给闲暇的 ${counts.later} 篇文章`
                            : "好文章，留着慢慢读"}
                        </strong>
                        <span>
                          {counts.later
                            ? "稍后读里的内容，等你有空再看。"
                            : "点击书签，把感兴趣的内容加入稍后读。"}
                        </span>
                      </span>
                      <span className="later-banner-link">
                        打开稍后读
                        <ArrowRight size={17} />
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>
      {toast && (
        <div className="rss-toast" role="status">
          <Check size={17} />
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={() => void toast.undo?.()}>撤销</button>
          )}
          <button aria-label="关闭通知" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {manage && (
        <Subscriptions
          feeds={feeds}
          mode={manage}
          errors={reader.feedErrors}
          syncing={syncing}
          onClose={() => setManage(null)}
          onSync={(feed) => reader.sync([feed])}
          onChanged={async (url) => {
            const next = await reader.refreshFeeds();
            if (feedUrl && !next.some((f) => f.url === feedUrl)) {
              setFeedUrl("");
              setView("today");
            }
            if (url) {
              const feed = next.find((f) => f.url === url);
              if (feed) void reader.sync([feed]);
            }
          }}
        />
      )}
      {settings && (
        <Dialog title="阅读设置" onClose={() => setSettings(false)}>
          <div className="dialog-body">
            <label htmlFor="reader-size">正文字号 · {prefs.fontSize}px</label>
            <input
              id="reader-size"
              type="range"
              min={15}
              max={24}
              step={1}
              value={prefs.fontSize}
              onChange={(e) =>
                void reader.changePreferences({
                  ...prefs,
                  fontSize: Number(e.target.value),
                })
              }
            />
            <p className="size-example" style={{ fontSize: prefs.fontSize }}>
              留一点时间，读一些值得留下的文字。
            </p>
            <div className="keyboard-guide">
              <span>
                J / K<span>下一篇 / 上一篇</span>
              </span>
              <span>
                S<span>收藏文章</span>
              </span>
              <span>
                M<span>切换已读</span>
              </span>
              <span>
                Esc<span>回到列表</span>
              </span>
            </div>
          </div>
          <footer>
            <span />
            <button
              className="primary-button"
              onClick={() => setSettings(false)}
            >
              完成
            </button>
          </footer>
        </Dialog>
      )}
    </main>
  );
}
