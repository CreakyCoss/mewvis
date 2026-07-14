import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-core-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const identifiersPath = resolve(root, "core/story-project/identifiers.ts");
const compilerRegistryPath = resolve(root, "core/story-project/project/registry.ts");
const declarativeCompilerPath = resolve(root, "core/story-project/compiler/compiler.ts");
const changeSetPath = resolve(root, "core/story-project/compiler/changes.ts");
const profilePath = resolve(root, "core/story-project/story-types/long-novel/profile.ts");
const layoutPath = resolve(root, "core/story-project/story-types/long-novel/layout.ts");
const storyTypeCatalogPath = resolve(root, "core/story-project/story-types/index.ts");
const shortStoryTypePath = resolve(root, "core/story-project/story-types/short-novel/index.ts");
const documentModelPath = resolve(root, "core/story-project/documents/model.ts");

writeFileSync(
  entryPath,
  `
  import {
    STORY_PROJECT_IDENTIFIERS,
  } from ${JSON.stringify(identifiersPath)};
  import { createStoryProjectCompilerRegistry } from ${JSON.stringify(compilerRegistryPath)};
  import { DECLARATIVE_STORY_PROJECT_COMPILER } from ${JSON.stringify(declarativeCompilerPath)};
  import {
    STORY_CHANGE_SET_MAX_BYTES,
    STORY_CHANGE_SET_MAX_OPERATIONS,
    storyChangeSetSchema,
  } from ${JSON.stringify(changeSetPath)};
  import { LONG_NOVEL_PROFILE, LONG_NOVEL_PROFILE_SOURCE } from ${JSON.stringify(profilePath)};
  import { LONG_NOVEL_LAYOUT as defaultLayout } from ${JSON.stringify(layoutPath)};
  import { listStoryProjectTypes } from ${JSON.stringify(storyTypeCatalogPath)};
  import { SHORT_NOVEL_STORY_TYPE } from ${JSON.stringify(shortStoryTypePath)};
  import { inspectStructuredJsonDocument } from ${JSON.stringify(documentModelPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const compiler = createStoryProjectCompilerRegistry([DECLARATIVE_STORY_PROJECT_COMPILER]);
  const dynamicCompiler = createStoryProjectCompilerRegistry();
  assert(
    dynamicCompiler.register(DECLARATIVE_STORY_PROJECT_COMPILER) === dynamicCompiler &&
      dynamicCompiler.resolve(STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format) ===
        DECLARATIVE_STORY_PROJECT_COMPILER,
    "Compiler Registry 应通过稳定接口支持注册和解析 Compiler。",
  );
  const api = compiler.compile(STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format, {
    profile: LONG_NOVEL_PROFILE_SOURCE,
    layout: defaultLayout,
  });
  assert(
    listStoryProjectTypes().map((storyType) => storyType.id).join(",") === "long-novel,short-novel",
    "Story Project 应统一暴露可供前端选择的长篇与短篇故事类型。",
    listStoryProjectTypes(),
  );
  const timestamp = 1_800_000_000_000;
  let project = api.createProject({ storyId: "story-contract", title: "雾港档案", timestamp });
  const info = () => api.projectInfo(project);
  const changes = { profileId: api.identity.profileId, profileVersion: api.identity.profileVersion };
  const file = (path: string) => api.projectFiles(project).find((entry) => entry.path === path)?.value as any;

  assert(api.validateProject(project, "draft").valid, "新故事应通过 draft 校验。", api.validateProject(project, "draft"));
  const shortProject = SHORT_NOVEL_STORY_TYPE.initialize(
    api,
    api.createProject({ storyId: "short-story", title: "雾港一夜", timestamp }),
  );
  assert(
    (api.projectFiles(shortProject).find((entry) => entry.path === "story/positioning.json")?.value as any)
      ?.lengthType === "short",
    "短篇故事类型应通过统一初始化流程写入短篇默认值。",
  );
  assert(file("story/book.json")?.title === "雾港档案", "默认 Profile 应创建作品核心。", api.projectFiles(project));
  assert(file("story/interactive/graph.json")?.kind === "story-graph", "默认 Profile 应创建互动剧情图。", api.projectFiles(project));
  assert(
    api.describe().documentRoles.chapterContent === "story-chapter-content" &&
      api.describe().documents[api.describe().documentRoles.chapterContent]?.contentType === "markdown",
    "调用方应通过 Profile 文档角色定位章节正文，而不是硬编码 kind。",
    api.describe().documentRoles,
  );
  assert(
    LONG_NOVEL_PROFILE.optionalDocumentKinds.join(",") === "story-analysis,story-review,story-import",
    "默认 Profile 应显式声明可由 Layout 关闭的文档类型。",
    LONG_NOVEL_PROFILE.optionalDocumentKinds,
  );
  const encodedBook = api.encodeDocument(file("story/book.json"), "story/book.json") as any;
  assert(encodedBook.kind === "story-book" && !("$format" in encodedBook), "JSON 应保存为普通业务对象。", encodedBook);

  const frontendDocument = {
    path: "story/book.json",
    updatedAt: timestamp,
    definition: {
      kind: "story-book",
      label: api.document("story-book").label,
      fields: api.documentFields("story-book"),
      definitions: api.describe().objectDefinitions,
    },
    value: file("story/book.json"),
  };
  assert(inspectStructuredJsonDocument(frontendDocument)?.fields["/title"]?.label === "书名", "编辑器应读取 Profile 字段元数据。");

  project = api.applyChanges(project, {
    ...changes,
    storyId: info().storyId,
    baseRevision: info().revision,
    validationProfile: "draft",
    operations: [
      { type: "patch", path: "story/book.json", value: { premise: "港口迷雾中的调查。" } },
      { type: "append-text", path: "story/book.json", field: "premise", value: "谎言会留下颜色。", separator: "\\n" },
      { type: "replace-text", path: "story/book.json", field: "premise", oldText: "调查", newText: "追查" },
    ],
  }).project;
  assert(file("story/book.json")?.premise === "港口迷雾中的追查。\\n谎言会留下颜色。", "文本增量操作应保留其他字段。", file("story/book.json"));

  const volume = {
    kind: "story-volume", id: "vol-001", number: 1, title: "谎言之色", startChapter: 1, endChapter: 10,
    targetWords: 30000, phase: "opening", purpose: "建立能力", coreConflict: "导师隐瞒真相", coreEvent: "确认导师说谎",
    startState: "孤立", endState: "掌握线索", emotionalArc: "压迫到反击", allowedReveals: [], prohibitedReveals: [], chapterIds: ["ch-001"],
  };
  const plan = {
    kind: "story-chapter-plan", id: "ch-001", number: 1, volumeId: "vol-001", title: "异常颜色", phase: "opening",
    phasePosition: "开篇", chapterRole: "progress", targetWords: 1000, targetEmotion: "压迫后的期待", coreEvent: "识别谎言",
    structureFormula: "发现+受阻+线索", openingHook: "异常颜色", payoff: "确认线索", releaseGuards: [],
    summary: { cause: "调查", development: "试探", turn: "冲突", climax: "暴露", ending: "线索" },
    plotLines: { main: "调查", secondary: "", event: "核对", relationship: "", logic: "发现→证实" },
    participantIds: [], appearanceOrder: [], worldRefIds: [], pointOfView: "第三人称限知", informationGap: "读者先知道证人在说谎",
    relationshipChanges: [], beats: [{ id: "beat-001", summary: "识别谎言", function: "information-reveal", density: "dense", wordBudget: 1000, participantIds: [], worldRefIds: [] }],
    costAndPayoff: "暴露风险换取线索", ending: { resolvedState: "确认说谎", unresolvedQuestion: "为何说谎", nextDrive: "追查来源", hookType: "information-gap", hookStrength: "medium" }, status: "ready",
  };
  const chapterResult = {
    kind: "story-chapter", id: "ch-001", planId: "ch-001", number: 1, title: "异常颜色", status: "draft",
    summary: "确认关键证人在说谎。", wordCount: 22, participantIds: [], worldRefIds: [],
    stateChanges: { characterIds: [], relationshipIds: [], foreshadowIds: [], timelineEntryIds: [] },
  };
  project = api.applyChanges(project, {
    ...changes, storyId: info().storyId, baseRevision: info().revision, validationProfile: "draft",
    operations: [
      { type: "upsert", path: "story/outline/volumes/vol-001.json", value: volume },
      { type: "upsert", path: "story/outline/chapters/ch-001.json", value: plan },
    ],
  }).project;
  project = api.applyChanges(project, {
    ...changes, storyId: info().storyId, baseRevision: info().revision, validationProfile: "draft",
    operations: [
      { type: "upsert", path: "story/chapters/ch-001.md", value: "# 第一章 异常颜色\\n\\n林砚看见了不该出现的颜色。" },
      { type: "upsert", path: "story/tracking/chapter-results/ch-001.json", value: chapterResult },
    ],
  }).project;
  const context = api.readContext(project, { scope: "chapter", targetId: "ch-001" });
  assert(context.text.includes("# 章节写作上下文") && context.text.includes("- 书名：") && context.text.includes("林砚看见了不该出现的颜色"), "章节上下文应使用 Profile label 拼接可读文本。", context);
  assert(typeof api.encodeDocument(file("story/chapters/ch-001.md"), "story/chapters/ch-001.md") === "string", "章节正文应编码为 Markdown。");

  const tooMany = storyChangeSetSchema.safeParse({
    ...changes, storyId: info().storyId, baseRevision: info().revision, validationProfile: "draft",
    operations: Array.from({ length: STORY_CHANGE_SET_MAX_OPERATIONS + 1 }, () => ({ type: "patch", path: "story/book.json", value: { premise: "拆批" } })),
  });
  assert(!tooMany.success, "ChangeSet 应限制操作数量。");
  const oversized = storyChangeSetSchema.safeParse({
    ...changes, storyId: info().storyId, baseRevision: info().revision, validationProfile: "draft",
    operations: [{ type: "append-text", path: "story/book.json", field: "premise", value: "字".repeat(STORY_CHANGE_SET_MAX_BYTES) }],
  });
  assert(!oversized.success, "ChangeSet 应限制字节数。");

  const customProfile: any = structuredClone(LONG_NOVEL_PROFILE_SOURCE);
  const customLayout: any = structuredClone(defaultLayout);
  customProfile.documents["story-research-note"] = {
    label: "研究笔记", layoutPresence: "required", cardinality: "many", fieldSets: ["entity-document"],
    constFields: { "/kind": "story-research-note" }, fields: { "/title": { type: "text", label: "标题", required: true }, "/content": { type: "content", label: "内容", required: true, default: "" } },
  };
  customProfile.contextViews["project-summary"].documentKinds.push("story-research-note");
  customLayout.documents["story-research-note"] = { pathPattern: "story/materials/research/{id}.json" };
  const customApi = compiler.compile(STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format, { profile: customProfile, layout: customLayout });
  let customProject = customApi.createProject({ storyId: "custom", title: "可扩展故事", timestamp });
  customProject = customApi.applyChanges(customProject, {
    profileId: customApi.identity.profileId, profileVersion: customApi.identity.profileVersion, storyId: "custom", baseRevision: 0, validationProfile: "draft",
    operations: [{ type: "upsert", path: "story/materials/research/note-001.json", value: { kind: "story-research-note", id: "note-001", title: "港口资料", content: "潮汐时间。" } }],
  }).project;
  assert(customApi.projectFiles(customProject).some((entry) => entry.path === "story/materials/research/note-001.json"), "Profile 新增文档类型后，通用运行时应自动支持校验与落盘。", customApi.projectFiles(customProject));
  assert(customApi.readContext(customProject, { scope: "project" }).text.includes("港口资料"), "加入 context view 的自定义文档应自动进入召回文本。");

  const leanLayout: any = structuredClone(defaultLayout);
  delete leanLayout.documents["story-analysis"];
  delete leanLayout.documents["story-review"];
  delete leanLayout.documents["story-import"];
  const leanApi = compiler.compile(STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format, {
    profile: LONG_NOVEL_PROFILE_SOURCE,
    layout: leanLayout,
  });
  const leanProject = leanApi.createProject({ storyId: "lean", title: "精简故事", timestamp });
  assert(!leanApi.describe().documents["story-analysis"], "Layout 关闭的可选文档不应暴露给调用方。", leanApi.describe());
  assert(!leanApi.describe().documentRoles.analysis, "Layout 关闭可选文档后也应关闭对应语义角色。", leanApi.describe());
  assert(
    !leanApi.contextView("project").documentKinds.includes("story-analysis"),
    "上下文视图应自动过滤 Layout 关闭的可选文档。",
    leanApi.contextView("project"),
  );
  let disabledDocumentRejected = false;
  try {
    leanApi.resolveDocument("story-analysis", { id: "disabled" });
  } catch (error) {
    disabledDocumentRejected = String(error).includes("未定义故事文档类型");
  }
  assert(disabledDocumentRejected, "关闭的可选文档不能再解析文件路径。");
  assert(leanApi.validateProject(leanProject, "draft").valid, "关闭可选文档后的故事项目仍应通过校验。", leanApi.validateProject(leanProject, "draft"));
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
    alias: { "@": resolve(root, "src") },
  });
  await import(pathToFileURL(bundledPath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
