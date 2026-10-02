import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const defaultDocsRoot = join(repositoryRoot, "docs");
const slash = (path) => path.split(sep).join("/");
const textOf = (node) =>
  node.value ??
  node.alt ??
  (node.children ?? [])
    .map(textOf)
    .join(["root", "list", "listItem", "table", "tableRow", "blockquote"].includes(node.type) ? "\n" : "");

export function parseSummary(source) {
  const entries = [];
  let group = "文档导航";
  for (const line of source.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) group = heading[1].trim();
    const item = /^( *)- \[([^\]]+)\]\(([^)]+\.md)\)\s*$/.exec(line);
    if (!item) continue;
    if (item[1].length % 2) throw new Error(`目录缩进必须为两个空格：${line}`);
    const depth = item[1].length / 2;
    const previous = entries.at(-1);
    if (depth && (!previous || previous.group !== group || depth > previous.depth + 1))
      throw new Error(`目录层级缺少父页面：${line}`);
    if (entries.some((entry) => entry.id === item[3])) throw new Error(`重复目录：${item[3]}`);
    if (item[3].startsWith("/") || item[3].split("/").includes("..")) throw new Error(`目录越界：${item[3]}`);
    entries.push({ id: item[3], title: item[2], group, depth });
  }
  if (!entries.length) throw new Error("文档目录为空");
  return entries;
}

async function markdownFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isSymbolicLink()) throw new Error(`文档不允许符号链接：${join(root, entry.name)}`);
    if (entry.isDirectory()) files.push(...(await markdownFiles(join(root, entry.name))));
    else if (entry.name.endsWith(".md")) files.push(join(root, entry.name));
  }
  return files.sort();
}

export async function compileBook(docsRoot = defaultDocsRoot) {
  const summary = await readFile(join(docsRoot, "SUMMARY.md"), "utf8");
  const entries = parseSummary(summary);
  const files = await markdownFiles(docsRoot);
  const ids = new Set(entries.map((entry) => entry.id));
  ids.add("SUMMARY.md");
  for (const file of files) {
    if (!ids.has(slash(relative(docsRoot, file)))) throw new Error(`文档未加入 SUMMARY：${file}`);
  }
  const links = [];
  const pages = [];
  for (const entry of [...entries, { id: "SUMMARY.md", title: "完整目录", group: "文档导航", depth: 0 }]) {
    const file = resolve(docsRoot, entry.id);
    const markdown = await readFile(file, "utf8");
    const headings = [];
    const used = new Set();
    let searchText = "";
    function indexMarkdown() {
      return (tree) => {
        searchText = tree.children.map(textOf).join("\n");
        function visit(node) {
          if (node.type === "heading") {
            const title = textOf(node);
            const base = title
              .toLowerCase()
              .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "")
              .replace(/\s/g, "-");
            let id = base || "section";
            let count = 0;
            while (used.has(id)) id = `${base || "section"}-${++count}`;
            used.add(id);
            headings.push({ id, title, level: node.depth });
            node.data = { ...node.data, hProperties: { id } };
          }
          for (const child of node.children ?? []) visit(child);
        }
        visit(tree);
      };
    }
    const html = renderToStaticMarkup(
      createElement(
        Markdown,
        {
          remarkPlugins: [remarkGfm, indexMarkdown],
          skipHtml: true,
          components: {
            a({ href, children }) {
              if (!href) return createElement("span", null, children);
              if (/^https?:\/\//i.test(href))
                return createElement("a", { href, "data-external": "true", rel: "noreferrer" }, children);
              if (/^[\w+.-]+:|^\/\//.test(href)) return createElement("span", null, children);
              const [pathname, fragment = ""] = href.split("#");
              let anchor;
              let decoded;
              try {
                anchor = decodeURIComponent(fragment);
                decoded = decodeURIComponent(pathname);
              } catch {
                throw new Error(`无效链接编码：${entry.id} → ${href}`);
              }
              const target = decoded ? resolve(dirname(file), decoded) : file;
              const id = slash(relative(docsRoot, target));
              if (!existsSync(target)) throw new Error(`链接目标不存在：${entry.id} → ${href}`);
              if (ids.has(id)) {
                links.push({ from: entry.id, id, anchor });
                return createElement(
                  "a",
                  {
                    href: `#${encodeURIComponent(id)}${anchor ? ":" + encodeURIComponent(anchor) : ""}`,
                    "data-doc": id,
                    "data-anchor": anchor,
                  },
                  children,
                );
              }
              return createElement(
                "span",
                { className: "source-reference", title: slash(relative(repositoryRoot, target)) },
                children,
                createElement("small", null, `（源码：${slash(relative(repositoryRoot, target))}）`),
              );
            },
            img({ src, alt }) {
              return createElement(
                "span",
                { className: "image-reference" },
                `图片：${alt || "未提供说明"}`,
                /^https?:\/\//i.test(src ?? "")
                  ? createElement("a", { href: src, "data-external": "true" }, "查看来源")
                  : null,
              );
            },
            table({ children }) {
              return createElement("div", { className: "table-scroll" }, createElement("table", null, children));
            },
          },
        },
        markdown,
      ),
    );
    if (!headings.some((heading) => heading.level === 1)) throw new Error(`文档缺少一级标题：${entry.id}`);
    pages.push({ ...entry, html, headings, text: searchText });
  }
  for (const link of links) {
    const target = pages.find((page) => page.id === link.id);
    if (link.anchor && !target.headings.some((heading) => heading.id === link.anchor))
      throw new Error(`锚点不存在：${link.from} → ${link.id}#${link.anchor}`);
  }
  return { version: 1, language: "zh-CN", title: "Mewvis 文档中心", entries, pages };
}

export async function checkReadmeLocations() {
  async function walk(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["node_modules", "dist", "build", "target", "skills"].includes(entry.name))
        continue;
      const path = join(root, entry.name);
      if (path === join(repositoryRoot, "packages/app/dev/templates")) continue;
      if (entry.isDirectory()) await walk(path);
      else if (/^readme(?:[.-].*)?$/i.test(entry.name))
        throw new Error(`请将自有 README 写入 docs：${relative(repositoryRoot, path)}`);
    }
  }
  for (const directory of ["apps", "packages"]) await walk(join(repositoryRoot, directory));
}

export async function buildBook({ check = false } = {}) {
  await checkReadmeLocations();
  const book = await compileBook();
  if (!check) {
    await mkdir(join(defaultDocsRoot, ".generated"), { recursive: true });
    await writeFile(join(defaultDocsRoot, ".generated/book.json"), JSON.stringify(book) + "\n");
  }
  return book;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const book = await buildBook({ check });
  console.log(`中文文档${check ? "检查" : "构建"}通过：${book.pages.length} 页。`);
}
