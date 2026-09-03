document.body.innerHTML = `
  <main class="rss-app">
    <section class="pane feeds-pane is-mobile-active" data-pane="feeds" aria-label="订阅源">
      <header class="pane-header">
        <div>
          <p class="eyebrow">我的订阅</p>
          <h1>订阅源</h1>
        </div>
        <button class="icon-button" type="button" data-action="show-add" aria-label="添加订阅" title="添加订阅">＋</button>
      </header>
      <div class="pane-toolbar">
        <span id="feed-count">0 个订阅</span>
        <button class="text-button" type="button" data-action="reload-feeds">刷新</button>
      </div>
      <div id="feed-error" class="notice notice-error" role="alert" hidden></div>
      <div id="feed-list" class="feed-list" aria-live="polite"></div>
    </section>

    <section class="pane entries-pane" data-pane="entries" aria-label="文章列表">
      <header class="pane-header article-list-heading">
        <button class="back-button mobile-only" type="button" data-action="show-feeds">‹ 订阅</button>
        <div class="heading-copy">
          <p id="feed-category" class="eyebrow">文章</p>
          <h2 id="feed-title">选择订阅源</h2>
        </div>
        <button class="icon-button" type="button" data-action="fetch-feed" aria-label="刷新文章" title="刷新文章">↻</button>
      </header>
      <div id="fetch-error" class="notice notice-error" role="alert" hidden></div>
      <div id="entry-list" class="entry-list" aria-live="polite"></div>
    </section>

    <article class="pane reader-pane" data-pane="reader" aria-labelledby="reader-title">
      <header class="reader-actions">
        <button class="back-button mobile-only" type="button" data-action="show-entries">‹ 文章</button>
        <button id="open-article" class="secondary-button" type="button" hidden>打开原文 ↗</button>
      </header>
      <div id="reader-empty" class="empty-state">
        <span class="empty-icon" aria-hidden="true">▤</span>
        <h2>选择一篇文章</h2>
        <p>文章摘要会在这里展开，原文将通过系统浏览器打开。</p>
      </div>
      <div id="reader-content" class="reader-content" hidden>
        <p id="reader-source" class="eyebrow"></p>
        <h2 id="reader-title"></h2>
        <p id="reader-meta" class="reader-meta"></p>
        <div id="reader-summary" class="reader-summary"></div>
      </div>
    </article>
  </main>

  <dialog id="add-dialog" class="dialog">
    <form id="add-form" method="dialog">
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">新订阅</p>
          <h2>添加 RSS / Atom</h2>
          <p>保存前会抓取并校验地址。</p>
        </div>
        <button class="icon-button" type="button" data-action="close-add" aria-label="关闭">×</button>
      </div>
      <label for="feed-url">订阅地址 <span>*</span></label>
      <input id="feed-url" name="url" type="url" inputmode="url" required placeholder="https://example.com/feed.xml" />
      <label for="feed-name">名称 <small>可选</small></label>
      <input id="feed-name" name="name" type="text" maxlength="160" placeholder="留空时使用订阅源名称" />
      <label for="feed-category-input">分类 <small>可选</small></label>
      <input id="feed-category-input" name="category" type="text" maxlength="80" placeholder="例如：技术" />
      <div id="add-error" class="notice notice-error" role="alert" hidden></div>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" data-action="close-add">取消</button>
        <button id="add-submit" class="primary-button" type="submit">添加订阅</button>
      </div>
    </form>
  </dialog>

  <dialog id="remove-dialog" class="dialog dialog-small">
    <div class="dialog-heading">
      <div>
        <p class="eyebrow danger-copy">删除订阅</p>
        <h2>确定移除？</h2>
        <p id="remove-copy"></p>
      </div>
    </div>
    <div class="dialog-actions">
      <button class="secondary-button" type="button" data-action="cancel-remove">取消</button>
      <button id="remove-submit" class="danger-button" type="button">移除订阅</button>
    </div>
  </dialog>
`;

const state = {
  feeds: [],
  selectedUrl: "",
  entries: [],
  selectedIndex: -1,
  removal: null,
  feedRequest: 0,
  fetchRequest: 0,
};

const $ = (selector) => document.querySelector(selector);
const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const text = (value) => (typeof value === "string" ? value : "");
const responseValue = (response) => record(response).value;
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};
const plainText = (value) => {
  if (!value) return "";
  return new DOMParser().parseFromString(value, "text/html").body.textContent?.trim() || "";
};
const displayDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
};
const setError = (selector, message) => {
  const element = $(selector);
  element.textContent = message || "";
  element.hidden = !message;
};
const setBusy = (button, busy, busyLabel, idleLabel) => {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
};
const showPane = (name) => {
  for (const pane of document.querySelectorAll("[data-pane]")) {
    pane.classList.toggle("is-mobile-active", pane.dataset.pane === name);
  }
};

const renderFeeds = (loading = false) => {
  const list = $("#feed-list");
  $("#feed-count").textContent = `${state.feeds.length} 个订阅`;
  list.replaceChildren();
  if (loading) {
    list.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在读取订阅</div>';
    return;
  }
  if (!state.feeds.length) {
    list.innerHTML = `
      <div class="empty-state compact">
        <span class="empty-icon" aria-hidden="true">◌</span>
        <h2>还没有订阅</h2>
        <p>添加一个 RSS 或 Atom 地址开始阅读。</p>
        <button class="primary-button" type="button" data-action="show-add">添加订阅</button>
      </div>`;
    return;
  }
  for (const feed of state.feeds) {
    const row = document.createElement("div");
    row.className = `feed-row${feed.url === state.selectedUrl ? " is-selected" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feed-button";
    button.addEventListener("click", () => selectFeed(feed.url));
    const mark = document.createElement("span");
    mark.className = "feed-mark";
    mark.textContent = (feed.name || new URL(feed.url).hostname || "R").trim().slice(0, 1).toUpperCase();
    const copy = document.createElement("span");
    copy.className = "feed-copy";
    const name = document.createElement("strong");
    name.textContent = feed.name || feed.url;
    const meta = document.createElement("small");
    meta.textContent = feed.category || new URL(feed.url).hostname;
    copy.append(name, meta);
    button.append(mark, copy);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.setAttribute("aria-label", `移除 ${feed.name || feed.url}`);
    remove.title = "移除订阅";
    remove.textContent = "×";
    remove.addEventListener("click", () => askRemove(feed));
    row.append(button, remove);
    list.append(row);
  }
};

const renderEntries = (loading = false) => {
  const list = $("#entry-list");
  const feed = state.feeds.find((item) => item.url === state.selectedUrl);
  $("#feed-title").textContent = feed?.name || (feed ? feed.url : "选择订阅源");
  $("#feed-category").textContent = feed?.category || "最新文章";
  list.replaceChildren();
  if (loading) {
    list.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在更新文章</div>';
    return;
  }
  if (!state.selectedUrl) {
    list.innerHTML = '<div class="empty-state compact"><p>从左侧选择一个订阅源。</p></div>';
    return;
  }
  if (!state.entries.length) {
    list.innerHTML = '<div class="empty-state compact"><h2>没有文章</h2><p>这个订阅源暂时没有返回可读条目。</p></div>';
    return;
  }
  state.entries.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `entry-button${index === state.selectedIndex ? " is-selected" : ""}`;
    button.addEventListener("click", () => selectEntry(index));
    const title = document.createElement("strong");
    title.textContent = entry.title || "无标题文章";
    const summary = document.createElement("span");
    summary.textContent = plainText(entry.summary || entry.content).slice(0, 120) || "暂无摘要";
    const meta = document.createElement("small");
    meta.textContent = [entry.author, displayDate(entry.pubDate || entry.pubDateRaw)].filter(Boolean).join(" · ");
    button.append(title, summary, meta);
    list.append(button);
  });
};

const renderReader = () => {
  const entry = state.entries[state.selectedIndex];
  $("#reader-empty").hidden = Boolean(entry);
  $("#reader-content").hidden = !entry;
  const openButton = $("#open-article");
  const link = safeUrl(entry?.link);
  openButton.hidden = !link;
  openButton.dataset.url = link;
  if (!entry) return;
  const feed = state.feeds.find((item) => item.url === state.selectedUrl);
  $("#reader-source").textContent = feed?.name || feed?.url || "订阅文章";
  $("#reader-title").textContent = entry.title || "无标题文章";
  $("#reader-meta").textContent = [entry.author, displayDate(entry.pubDate || entry.pubDateRaw)]
    .filter(Boolean)
    .join(" · ");
  $("#reader-summary").textContent = plainText(entry.content || entry.summary) || "该条目没有提供正文摘要。";
};

const loadFeeds = async (preferredUrl = "") => {
  const request = ++state.feedRequest;
  setError("#feed-error", "");
  renderFeeds(true);
  try {
    const value = record(responseValue(await window.islePlugin.executeTool("rss_list")));
    if (request !== state.feedRequest) return;
    state.feeds = Array.isArray(value.feeds)
      ? value.feeds.map(record).filter((feed) => typeof feed.url === "string")
      : [];
    const candidate = preferredUrl || state.selectedUrl;
    state.selectedUrl = state.feeds.some((feed) => feed.url === candidate) ? candidate : state.feeds[0]?.url || "";
    renderFeeds();
    await fetchFeed();
  } catch (error) {
    if (request !== state.feedRequest) return;
    state.feeds = [];
    state.selectedUrl = "";
    renderFeeds();
    renderEntries();
    renderReader();
    setError("#feed-error", error instanceof Error ? error.message : String(error));
  }
};

const fetchFeed = async () => {
  const request = ++state.fetchRequest;
  setError("#fetch-error", "");
  state.entries = [];
  state.selectedIndex = -1;
  renderReader();
  if (!state.selectedUrl) {
    renderEntries();
    return;
  }
  renderEntries(true);
  try {
    const value = record(
      responseValue(await window.islePlugin.executeTool("rss_fetch", { url: state.selectedUrl, limit: 40 })),
    );
    if (request !== state.fetchRequest) return;
    state.entries = Array.isArray(value.entries) ? value.entries.map(record) : [];
    state.selectedIndex = state.entries.length ? 0 : -1;
    renderEntries();
    renderReader();
  } catch (error) {
    if (request !== state.fetchRequest) return;
    state.entries = [];
    state.selectedIndex = -1;
    renderEntries();
    renderReader();
    setError("#fetch-error", error instanceof Error ? error.message : String(error));
  }
};

const selectFeed = (url) => {
  if (state.selectedUrl === url) {
    showPane("entries");
    return;
  }
  state.selectedUrl = url;
  renderFeeds();
  showPane("entries");
  void fetchFeed();
};

const selectEntry = (index) => {
  state.selectedIndex = index;
  renderEntries();
  renderReader();
  showPane("reader");
};

const askRemove = (feed) => {
  state.removal = feed;
  $("#remove-copy").textContent = `“${feed.name || feed.url}” 将从订阅列表移除。`;
  $("#remove-dialog").showModal();
};

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "show-add") {
    setError("#add-error", "");
    $("#add-dialog").showModal();
    requestAnimationFrame(() => $("#feed-url").focus());
  }
  if (action === "close-add") $("#add-dialog").close();
  if (action === "reload-feeds") void loadFeeds(state.selectedUrl);
  if (action === "fetch-feed") void fetchFeed();
  if (action === "show-feeds") showPane("feeds");
  if (action === "show-entries") showPane("entries");
  if (action === "cancel-remove") {
    state.removal = null;
    $("#remove-dialog").close();
  }
});

$("#add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = $("#add-submit");
  const data = new FormData(form);
  const url = text(data.get("url")).trim();
  setBusy(button, true, "正在校验…", "添加订阅");
  setError("#add-error", "");
  try {
    await window.islePlugin.executeTool("rss_add", {
      url,
      name: text(data.get("name")).trim(),
      category: text(data.get("category")).trim(),
    });
    form.reset();
    $("#add-dialog").close();
    showPane("entries");
    await loadFeeds(url);
  } catch (error) {
    setError("#add-error", error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(button, false, "正在校验…", "添加订阅");
  }
});

$("#remove-submit").addEventListener("click", async () => {
  if (!state.removal) return;
  const button = $("#remove-submit");
  setBusy(button, true, "正在移除…", "移除订阅");
  try {
    await window.islePlugin.executeTool("rss_remove", { url: state.removal.url });
    state.removal = null;
    $("#remove-dialog").close();
    showPane("feeds");
    await loadFeeds();
  } catch (error) {
    $("#remove-dialog").close();
    setError("#feed-error", error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(button, false, "正在移除…", "移除订阅");
  }
});

$("#open-article").addEventListener("click", async (event) => {
  const url = event.currentTarget.dataset.url;
  if (!url) return;
  try {
    await window.islePlugin.openExternal(url);
  } catch (error) {
    setError("#fetch-error", error instanceof Error ? error.message : String(error));
  }
});

void loadFeeds();
