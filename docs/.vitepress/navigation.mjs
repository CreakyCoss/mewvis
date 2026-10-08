import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSummary } from "../../scripts/docs/summary.mjs";

export const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repositoryRoot = resolve(docsRoot, "..");
export const repositoryUrl = "https://github.com/CreakyCoss/mewvis";
export const siteBase = "/mewvis/";
export const siteUrl = "https://creakycoss.github.io/mewvis/";
export const entries = parseSummary(
  readFileSync(resolve(docsRoot, "SUMMARY.md"), "utf8"),
);

export const pageLink = (id) =>
  id === "README.md" ? "/" : `/${id.replace(/\.md$/, "")}`;

export function createSidebar() {
  const sidebar = [];
  let currentGroup;
  let group;
  let parents = [];
  for (const entry of entries) {
    if (entry.group !== currentGroup) {
      currentGroup = entry.group;
      parents = [];
      if (currentGroup === "文档导航") {
        group = sidebar;
      } else {
        const section = {
          text: currentGroup,
          collapsed: !["开发入门", "应用开发"].includes(currentGroup),
          items: [],
        };
        sidebar.push(section);
        group = section.items;
      }
    }
    const item = { text: entry.title, link: pageLink(entry.id) };
    if (entry.depth === 0) group.push(item);
    else {
      const parent = parents[entry.depth - 1];
      parent.items ??= [];
      parent.items.push(item);
    }
    parents[entry.depth] = item;
    parents.length = entry.depth + 1;
  }
  return sidebar;
}

// Markdown stays suitable for both GitHub and the offline reader. Only the
// website render redirects references to source files outside docs to GitHub.
export function configureDocumentLinks(md) {
  md.core.ruler.after("inline", "mewvis-document-links", (state) => {
    const source = resolve(docsRoot, state.env.relativePath || "README.md");
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        if (token.type !== "link_open") continue;
        const href = token.attrGet("href");
        if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) continue;
        const [, pathname, suffix = ""] = /^([^?#]*)(.*)$/.exec(href);
        const target = resolve(dirname(source), decodeURIComponent(pathname));
        if (!existsSync(target))
          throw new Error(
            `链接目标不存在：${state.env.relativePath} → ${href}`,
          );
        const docPath = relative(docsRoot, target).split(sep).join("/");
        if (docPath !== ".." && !docPath.startsWith("../")) {
          if (docPath.endsWith(".md"))
            token.attrSet("href", `${pageLink(docPath)}${suffix}`);
          continue;
        }
        const repoPath = relative(repositoryRoot, target)
          .split(sep)
          .map(encodeURIComponent)
          .join("/");
        const kind = statSync(target).isDirectory() ? "tree" : "blob";
        token.attrSet(
          "href",
          `${repositoryUrl}/${kind}/main/${repoPath}${suffix}`,
        );
      }
    }
  });
}
