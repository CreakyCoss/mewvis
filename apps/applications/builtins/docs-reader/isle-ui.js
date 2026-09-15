document.documentElement.lang = "zh-CN";
document.body.innerHTML = `
  <div class="docs-app">
    <aside class="sidebar" aria-label="文档导航">
      <header class="brand"><strong>Isle<span>文档中心</span></strong><span class="language">简体中文</span></header>
      <div class="search-box"><label for="docs-search">搜索文档</label><input id="docs-search" type="search" maxlength="200" placeholder="搜索标题、内容或 API…" autocomplete="off"><span class="hint">⌘ / Ctrl K</span></div>
      <div class="search-status" role="status" aria-live="polite"></div>
      <nav class="chapter-list" aria-label="章节目录"></nav>
      <nav class="search-results" aria-label="搜索结果" hidden></nav>
      <footer class="sidebar-footer">中文文档 · 随应用离线提供</footer>
    </aside>
    <main class="reading-pane">
      <header class="reader-toolbar">
        <button class="menu-toggle" type="button" aria-expanded="false" aria-label="展开文档目录">目录</button>
        <button class="history-back" type="button" aria-label="返回上一阅读位置" disabled>←</button>
        <button class="history-forward" type="button" aria-label="前往下一阅读位置" disabled>→</button>
        <span class="breadcrumb">Isle 文档</span><span class="page-count"></span>
      </header>
      <div class="reader-scroll">
        <div class="reading-grid">
          <div class="page-column">
            <div class="notice" role="status" aria-live="polite">正在加载文档…</div>
            <article class="prose" aria-label="文档正文" tabindex="-1"></article>
            <nav class="page-navigation" aria-label="相邻文档"></nav>
          </div>
          <aside class="outline" aria-label="本页目录"><strong>本页内容</strong><nav></nav></aside>
        </div>
      </div>
    </main>
  </div>`;

const $ = (selector) => document.querySelector(selector);
const state = {
  entries: [],
  current: null,
  history: [],
  position: -1,
  readVersion: 0,
  searchVersion: 0,
  searchTimer: null,
};
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const action = (title, callback, className = "") => {
  const button = element("button", className, title);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
};
const execute = async (name, args = {}) => {
  if (!window.isleApplication) throw new Error("未连接 Isle 应用宿主，请重新打开文档中心。");
  return (await window.isleApplication.executeTool(name, args)).value;
};
function notice(message, retry) {
  const node = $(".notice");
  node.replaceChildren();
  node.hidden = !message;
  node.setAttribute("role", retry ? "alert" : "status");
  if (message) node.append(element("span", "", message));
  if (retry) node.append(action("重试", retry));
}
function showMenu(open) {
  $(".docs-app").classList.toggle("menu-open", open);
  $(".menu-toggle").setAttribute("aria-expanded", String(open));
}
function renderCatalog() {
  const nav = $(".chapter-list");
  nav.replaceChildren();
  let group;
  let container;
  for (const entry of state.entries) {
    if (entry.group !== group) {
      group = entry.group;
      container = element("details", "chapter");
      container.open = true;
      container.append(element("summary", "", group));
      nav.append(container);
    }
    const button = action(entry.title, () => openPage(entry.id), "chapter-link");
    button.dataset.page = entry.id;
    button.style.paddingInlineStart = `${16 + entry.depth * 14}px`;
    container.append(button);
  }
}
function jumpTo(anchor) {
  const target = [...$(".prose").querySelectorAll("[id]")].find((node) => node.id === anchor);
  if (target) target.scrollIntoView({ block: "start" });
}
function updateHistory() {
  $(".history-back").disabled = state.position <= 0;
  $(".history-forward").disabled = state.position >= state.history.length - 1;
}
async function openPage(id, anchor = "", historyPosition = null) {
  const version = ++state.readVersion;
  notice("正在加载文档…");
  $(".prose").setAttribute("aria-busy", "true");
  try {
    const page = await execute("isle_docs_read", { id });
    if (version !== state.readVersion) return;
    state.current = page;
    if (historyPosition !== null) state.position = historyPosition;
    else {
      state.history.splice(state.position + 1);
      state.history.push({ id, anchor });
      state.position = state.history.length - 1;
    }
    updateHistory();
    // HTML is generated with react-markdown/skipHtml at build time, never supplied by a tool caller.
    $(".prose").innerHTML = page.html;
    $(".breadcrumb").textContent = `${page.group} / ${page.title}`;
    const index = state.entries.findIndex((entry) => entry.id === page.id);
    $(".page-count").textContent = index < 0 ? "" : `${index + 1} / ${state.entries.length}`;
    for (const button of $(".chapter-list").querySelectorAll("[data-page]")) {
      if (button.dataset.page === page.id) {
        button.setAttribute("aria-current", "page");
        button.closest("details").open = true;
      } else button.removeAttribute("aria-current");
    }
    const outline = $(".outline nav");
    outline.replaceChildren();
    for (const heading of page.headings.filter((heading) => heading.level > 1 && heading.level <= 3)) {
      const button = action(heading.title, () => jumpTo(heading.id));
      button.style.paddingInlineStart = heading.level === 3 ? "20px" : "8px";
      outline.append(button);
    }
    $(".outline").hidden = outline.childElementCount === 0;
    const navigation = $(".page-navigation");
    navigation.replaceChildren();
    if (index > 0)
      navigation.append(
        action(`上一篇\n${state.entries[index - 1].title}`, () => openPage(state.entries[index - 1].id)),
      );
    if (index >= 0 && index < state.entries.length - 1)
      navigation.append(
        action(`下一篇\n${state.entries[index + 1].title}`, () => openPage(state.entries[index + 1].id)),
      );
    notice("");
    $(".reader-scroll").scrollTop = 0;
    showMenu(false);
    $(".prose").focus({ preventScroll: true });
    if (anchor) jumpTo(anchor);
  } catch (error) {
    if (version === state.readVersion)
      notice(error instanceof Error ? error.message : String(error), () => openPage(id, anchor, historyPosition));
  } finally {
    if (version === state.readVersion) $(".prose").removeAttribute("aria-busy");
  }
}
async function search(query, version) {
  const status = $(".search-status");
  try {
    const { results, total } = await execute("isle_docs_search", { query });
    if (version !== state.searchVersion) return;
    status.textContent = total
      ? `找到 ${total} 篇文档${total > 30 ? "，显示前 30 篇" : ""}`
      : "没有找到文档，试试其他关键词。";
    const container = $(".search-results");
    container.replaceChildren();
    for (const result of results) {
      const button = action("", () => openPage(result.id), "search-result");
      button.append(
        element("strong", "", result.title),
        element("small", "", result.group),
        element("span", "", result.excerpt),
      );
      container.append(button);
    }
  } catch (error) {
    if (version !== state.searchVersion) return;
    status.replaceChildren(
      element("span", "", `搜索失败：${error instanceof Error ? error.message : String(error)}`),
      action("重试", () => search(query, version)),
    );
  }
}
$("#docs-search").addEventListener("input", (event) => {
  clearTimeout(state.searchTimer);
  const query = event.target.value.trim();
  const version = ++state.searchVersion;
  $(".chapter-list").hidden = !!query;
  $(".search-results").hidden = !query;
  $(".search-results").replaceChildren();
  $(".search-status").textContent = query ? "正在搜索…" : "";
  if (query) state.searchTimer = setTimeout(() => search(query, version), 180);
});
$(".prose").addEventListener("click", async (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  event.preventDefault();
  if (link.dataset.doc) await openPage(link.dataset.doc, link.dataset.anchor || "");
  else if (link.dataset.external) {
    try {
      await window.isleApplication.openExternal(link.href);
    } catch (error) {
      notice(`无法打开链接：${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
$(".menu-toggle").addEventListener("click", () => showMenu(!$(".docs-app").classList.contains("menu-open")));
for (const [selector, delta] of [
  [".history-back", -1],
  [".history-forward", 1],
]) {
  $(selector).addEventListener("click", () => {
    const position = state.position + delta;
    const target = state.history[position];
    if (target) openPage(target.id, target.anchor, position);
  });
}
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    showMenu(true);
    $("#docs-search").focus();
  }
  if (event.key === "Escape") showMenu(false);
});
function syncTheme() {
  document.documentElement.dataset.theme = window.isleApplication?.getHost()?.theme === "dark" ? "dark" : "light";
}
window.addEventListener("isle:ready", syncTheme);
window.addEventListener("isle:theme", syncTheme);
syncTheme();
async function initialize() {
  notice("正在加载文档目录…");
  try {
    const catalog = await execute("isle_docs_catalog");
    state.entries = catalog.entries;
    if (!state.entries.length) throw new Error("文档目录为空，请重新构建应用内置文档。");
    renderCatalog();
    await openPage(state.entries[0].id);
  } catch (error) {
    notice(error instanceof Error ? error.message : String(error), initialize);
  }
}
initialize();
