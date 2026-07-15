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
const publicStorage = resolve(root, "core/story-project/storage/index.ts");
const memoryStorageEntry = resolve(root, "core/story-project/storage/adapters/memory.ts");

writeFileSync(
  entryPath,
  `
  import { createStoryProjectApi } from ${JSON.stringify(publicEntry)};
  import {
    type StoryProjectStorage,
  } from ${JSON.stringify(publicStorage)};
  import { createMemoryStoryProjectStorage } from ${JSON.stringify(memoryStorageEntry)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const storage: StoryProjectStorage = createMemoryStoryProjectStorage();
  assert(!("list" in storage) && !("read" in storage) && !("commit" in storage), "领域 Storage 不得暴露低层记录操作。", storage);

  const projects = createStoryProjectApi(storage);
  assert(projects.listStoryTypes().map((item) => item.id).join(",") === "long-novel,short-novel", "应提供长篇与短篇故事类型。", projects.listStoryTypes());
  const project = await projects.create("/memory/long", { storyTypeId: "long-novel", storyId: "story-1", title: "雾港档案" });
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
