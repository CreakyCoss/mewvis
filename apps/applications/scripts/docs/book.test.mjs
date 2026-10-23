import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import {
  checkReadmeLocations,
  compileBook,
  parseSummary,
  repositoryRoot,
} from "./book.mjs";
import { createLibrary } from "../../builtins/docs-reader/library.js";

test("目录拒绝重复、越界和缺少父级", () => {
  assert.throws(() => parseSummary("- [A](a.md)\n- [B](a.md)"), /重复/);
  assert.throws(() => parseSummary("- [A](../a.md)"), /越界/);
  assert.throws(() => parseSummary("  - [A](a.md)"), /父页面/);
});

test("内置应用和插件可保留自己的 README 与文档资源", async () => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-docs-locations-"));
  try {
    for (const path of [
      "apps/applications/builtins/example/README.md",
      "apps/applications/builtins/example/docs/README.zh-CN.md",
      "apps/extensions/example/README.md",
      "apps/extensions/example/docs/readme.md",
      "packages/app/dev/templates/react/README.md",
    ]) {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, "# 组件说明\n");
    }
    await checkReadmeLocations(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("宿主和共享开发包仍须将 README 集中到 docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-docs-locations-"));
  try {
    await mkdir(join(root, "apps"));
    await mkdir(join(root, "packages"));
    for (const path of [
      "apps/client/src/README.md",
      "apps/desktop/README.md",
      "apps/server/README.md",
      "apps/agent-runtime/README.zh-CN.md",
      "apps/applications/README.md",
      "apps/applications/scripts/README.md",
      "apps/applications/builtins-extra/README.md",
      "apps/extensions-extra/README.md",
      "packages/app/sdk/README.md",
      "packages/extension/host/readme.md",
    ]) {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, "# 宿主说明\n");
      await assert.rejects(checkReadmeLocations(root), (error) => {
        assert.match(error.message, /请将宿主 README 写入 docs/);
        assert.ok(error.message.endsWith(relative(root, file)));
        return true;
      });
      await rm(file);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("真实文档可编译，中文和英文 API 可搜索，读取不可越界", async () => {
  const book = await compileBook();
  const library = createLibrary(book);
  assert.ok(book.pages.length >= 30);
  assert.equal(book.language, "zh-CN");
  assert.ok(library.search("沙箱").total > 0);
  assert.ok(library.search("defineApplication").total > 0);
  assert.ok(library.search("Pi 沙箱").total > 0);
  assert.equal(library.search("zzzz不存在的关键词zzzz").total, 0);
  assert.equal(library.search("  ").total, 0);
  assert.throws(() => library.search("a".repeat(201)), /200/);
  assert.throws(() => library.read("../../package.json"), /不存在/);
  assert.throws(() => library.read("__proto__"), /不存在/);
  assert.match(library.read("apps/ui.md").html, /data-doc="apps\/development.md"/);
  assert.ok(library.read("apps/ui.md").headings.some((item) => item.title === "隔离与限制"));
  const snapshot = await readFile(join(repositoryRoot, "docs/.generated/book.json"), "utf8");
  assert.deepEqual(JSON.parse(snapshot), book, "打包索引必须与当前 docs 一致");
});

test("渲染保留 GFM、重复标题锚点，阻止原始 HTML 和危险链接", async () => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-docs-"));
  try {
    await writeFile(join(root, "SUMMARY.md"), "# 目录\n\n- [首页](README.md)\n");
    await writeFile(
      join(root, "README.md"),
      "# 测试\n\n## 重复\n\n## 重复\n\n[跳转](#重复-1)\n\n<script>alert(1)</script>\n\n[坏链接](javascript:alert%281%29)\n\n| 列 | 值 |\n|---|---|\n| 一 | 二 |\n\n- [x] 完成\n\n```js\n<script>\n```\n",
    );
    const book = await compileBook(root);
    const page = book.pages[0];
    assert.match(page.html, /id="重复-1"/);
    assert.match(page.html, /<table>/);
    assert.match(page.html, /type="checkbox"/);
    assert.match(page.html, /&lt;script&gt;/);
    assert.doesNotMatch(page.html, /<script>|javascript:/);
    await writeFile(join(root, "orphan.md"), "# 遗漏页面");
    await assert.rejects(compileBook(root), /未加入 SUMMARY/);
    await rm(join(root, "orphan.md"));
    await writeFile(join(root, "README.md"), "# 测试\n\n[坏链接](missing.md)");
    await assert.rejects(compileBook(root), /链接目标不存在/);
    await writeFile(join(root, "README.md"), "# 测试\n\n[坏锚点](#missing)");
    await assert.rejects(compileBook(root), /锚点不存在/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
