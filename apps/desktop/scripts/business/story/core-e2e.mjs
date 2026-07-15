import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-core-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const publicEntry = resolve(root, "core/story-project/index.ts");
const publicStore = resolve(root, "core/story-project/storage/index.ts");
const memoryStoreEntry = resolve(root, "core/story-project/storage/memory.ts");

writeFileSync(
  entryPath,
  `
  import { createStoryProjectApi } from ${JSON.stringify(publicEntry)};
  import {
    type StoryProjectStore,
  } from ${JSON.stringify(publicStore)};
  import { createMemoryStoryProjectStore } from ${JSON.stringify(memoryStoreEntry)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const revisions: Array<number | null> = [];
  const memoryStore = createMemoryStoryProjectStore();
  const store: StoryProjectStore = {
    list: (projectKey) => memoryStore.list(projectKey),
    read: (projectKey, key) => memoryStore.read(projectKey, key),
    commit: async (projectKey, transaction) => {
      revisions.push(transaction.revision.expected);
      await memoryStore.commit(projectKey, transaction);
    },
  };

  const projects = createStoryProjectApi(store);
  assert(projects.listStoryTypes().map((item) => item.id).join(",") === "long-novel,short-novel", "应提供长篇与短篇故事类型。", projects.listStoryTypes());
  const project = await projects.create("/memory/long", { storyTypeId: "long-novel", storyId: "story-1", title: "雾港档案" });
  assert(revisions[0] === null, "初始化应要求 Manifest 尚不存在。", revisions);
  const storedBook = await store.read("/memory/long", "story/book.json");
  assert(storedBook.contentType === "json", "Store 应接收结构化 JSON，而不是序列化文本。", storedBook);
  const description = await project.describe({ documentKinds: ["story-book", "story-character"] });
  assert(description.storyType.id === "long-novel" && description.storyType.version === 1, "公开描述应返回故事类型身份。", description.storyType);
  assert(description.roles.chapterContent === "story-chapter-content", "语义角色应由故事类型提供。", description.roles);
  assert(description.documents["story-chapter-content"]?.contentType === "markdown", "章节正文应声明 Markdown。", description.documents);
  assert(description.schemas.documents["story-book"]?.fields.title?.label === "书名", "按需 Schema 应提供可读字段信息。", description.schemas);
  assert(!("compiler" in description) && !("profile" in description), "公开边界不得泄露旧 Compiler/Profile。", description);

  const documents = await project.listDocuments();
  const book = documents.find((item) => item.path === "story/book.json");
  assert(book?.value && typeof book.value === "object" && !Array.isArray(book.value), "应初始化作品核心。", book);
  assert(book?.definition?.fields.title?.label === "书名", "通用编辑器应直接读取文档字段定义。", book?.definition);
  const overview = await project.overview();
  assert(overview.title === "雾港档案" && overview.id === "story-1", "概览应来自统一工作区处理器。", overview);

  const context = await project.readContext({ scope: "project" });
  const result = await project.commitChanges({
    storyTypeId: description.storyType.id,
    storyTypeVersion: description.storyType.version,
    storyId: "story-1",
    baseRevision: context.revision,
    validationMode: "draft",
    operations: [{ type: "patch", path: "story/book.json", value: { premise: "港口迷雾中的调查。" } }],
  });
  assert(result.committed && result.revision === 1, "合法 ChangeSet 应原子提交。", result);
  assert(revisions.at(-1) === 0, "增量提交应携带旧 revision 条件。", revisions);
  assert((await project.readContext({ scope: "project" })).text.includes("港口迷雾中的调查"), "召回文本应使用字段 label 和最新数据。" );

  const short = await projects.create("/memory/short", { storyTypeId: "short-novel", storyId: "story-2", title: "雾港一夜" });
  const positioning = (await short.listDocuments()).find((item) => item.path === "story/positioning.json")?.value as Record<string, unknown>;
  assert(positioning.lengthType === "short", "短篇类型应组合基础定义并覆写篇幅默认值。", positioning);
  console.log("[story-core] ok");
  `,
);

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundledPath,
    target: "node22",
  });
  await import(pathToFileURL(bundledPath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
