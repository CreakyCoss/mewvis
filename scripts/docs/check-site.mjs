import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  docsRoot,
  entries,
  siteBase,
} from "../../docs/.vitepress/navigation.mjs";

const output = resolve(docsRoot, ".vitepress/dist");
async function walk(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const files = new Set(await walk(output));
const pages = new Map();
for (const file of files) {
  if (!file.endsWith(".html")) continue;
  const html = await readFile(file, "utf8");
  pages.set(file, {
    html,
    anchors: new Set(
      [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
    ),
  });
}
for (const entry of entries) {
  const page =
    entry.id === "README.md"
      ? "index.html"
      : entry.id.replace(/\.md$/, ".html");
  assert(pages.has(resolve(output, page)), `缺少文档页面：${entry.id}`);
}

let checked = 0;
for (const [file, { html }] of pages) {
  const pageUrl = new URL(
    `${siteBase}${relative(output, file)}`,
    "https://docs.example",
  );
  for (const [, encoded] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const href = encoded.replaceAll("&amp;", "&");
    const url = new URL(href, pageUrl);
    if (url.origin !== pageUrl.origin) continue;
    assert(
      url.pathname.startsWith(siteBase),
      `链接未包含部署路径：${file} → ${href}`,
    );
    let path = decodeURIComponent(url.pathname.slice(siteBase.length));
    if (path.endsWith("/") || path === "") path += "index.html";
    const target = resolve(output, path);
    assert(
      files.has(target),
      `构建产物链接不存在：${relative(output, file)} → ${href}`,
    );
    if (url.hash && pages.has(target)) {
      assert(
        pages.get(target).anchors.has(decodeURIComponent(url.hash.slice(1))),
        `页内锚点不存在：${relative(output, file)} → ${href}`,
      );
    }
    checked++;
  }
}
console.log(
  `在线文档检查通过：${entries.length + 1} 篇文档，${checked} 个链接与资源。`,
);
