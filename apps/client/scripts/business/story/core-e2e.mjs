import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "isle-claw-story-core-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const publicEntry = resolve(root, "core/story-project/index.ts");
const publicStorage = resolve(root, "core/story-project/storage/index.ts");
const storageTypesEntry = resolve(root, "core/story-project/storage/types.ts");
const fileStorageEntry = resolve(root, "core/story-project/storage/adapters/file/index.ts");
const documentQueryEntry = resolve(root, "core/story-project/application/queries/document.ts");
const contextQueryEntry = resolve(root, "core/story-project/application/queries/context.ts");
const longNovelEntry = resolve(root, "core/story-project/story-types/long-novel/index.ts");

writeFileSync(
  entryPath,
  `
  import { createStoryProjectApi, storyDocumentIdentityKey } from ${JSON.stringify(publicEntry)};
  import { createStoryProjectStorage, type StoryProjectStorage } from ${JSON.stringify(publicStorage)};
  import type { StoryFileBackend } from ${JSON.stringify(storageTypesEntry)};
  import { assertStoryFileRevision } from ${JSON.stringify(fileStorageEntry)};
  import { editableStoryDocument } from ${JSON.stringify(documentQueryEntry)};
  import { readStoryProjectContext } from ${JSON.stringify(contextQueryEntry)};
  import { LONG_NOVEL_STORY_TYPE } from ${JSON.stringify(longNovelEntry)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) throw new Error(message + (details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2)));
  };
  const storage: StoryProjectStorage = createStoryProjectStorage({ kind: "memory", bindings: [] });
  assert(storyDocumentIdentityKey({ kind: "story-character", identity: { id: "character-1" } }) === "story-character?id=character-1", "公共 Facade 应提供不含路径语义的稳定文档 key。");
  assert(!("list" in storage) && !("read" in storage) && !("commit" in storage), "领域 Storage 不得暴露低层记录操作。", storage);

  const projects = createStoryProjectApi({ kind: "memory" });
  assert(projects.listStoryTypes().map((item) => item.id).join(",") === "long-novel,short-novel", "应提供长篇与短篇故事类型。", projects.listStoryTypes());
  const project = await projects.create("/memory/long", { storyTypeId: "long-novel", storyId: "story-1", title: "雾港档案" });
  const description = await project.describe({ documentKinds: ["story-book", "story-character"] });
  assert(description.storyType.id === "long-novel" && description.storyType.version === 4, "公开描述应返回故事类型身份。", description.storyType);
  assert(description.roles.chapterContent === "story-chapter-content", "语义角色应由故事类型提供。", description.roles);
  assert(description.documents["story-chapter-content"]?.contentFormat === "markdown", "章节正文应声明 Markdown。", description.documents);
  assert(description.schemas.documents["story-book"]?.fields.title?.label === "书名", "按需 Schema 应提供可读字段信息。", description.schemas);
  assert(!("compiler" in description) && !("profile" in description), "公开边界不得泄露旧 Compiler/Profile。", description);

  const documents = await project.listDocuments();
  assert(!documents.some((item) => item.ref.kind === "story-scene"), "新项目不应初始化旧互动剧情文档。", documents);
  const book = documents.find((item) => item.ref.kind === "story-book");
  assert(book?.value && typeof book.value === "object" && !Array.isArray(book.value), "应初始化作品核心。", book);
  const bookValue = book?.value as Record<string, unknown>;
  assert(!("playerName" in bookValue) && !("mode" in bookValue), "作品核心不应包含玩家称呼或故事模式。", bookValue);
  assert(book?.definition?.fields.title?.label === "书名", "通用编辑器应直接读取文档字段定义。", book?.definition);
  assert(book?.displayName === "作品核心", "未声明实例显示规则的单例文档应使用类型名称。", book);
  const overview = await project.overview();
  assert(overview.title === "雾港档案" && overview.id === "story-1", "概览应来自统一工作区处理器。", overview);

  const context = await project.readContext({ scope: "project" });
  const result = await project.commitChanges({
    storyTypeId: description.storyType.id,
    storyTypeVersion: description.storyType.version,
    storyId: "story-1",
    baseRevision: context.revision,
    validationMode: "draft",
    operations: [{ type: "patch", ref: { kind: "story-book", identity: {} }, value: { premise: "港口迷雾中的调查。" } }],
  });
  assert(result.committed && result.revision === 1, "合法 ChangeSet 应原子提交。", result);
  assert((await project.readContext({ scope: "project" })).text.includes("港口迷雾中的调查"), "召回文本应使用字段 label 和最新数据。" );

  const character = await project.saveDocument({
    ref: { kind: "story-character", identity: { id: "character-1" } },
    value: { name: "沈砚", role: "protagonist", memory: {} },
  });
  assert(character.displayName === "沈砚", "多实例文档应按 definitions 声明生成显示名称。", character);
  assert(
    (await project.listDocuments()).find((item) => item.ref.kind === "story-character")?.displayName === "沈砚",
    "文档列表应返回 application 解析后的显示名称。",
  );
  const chapterEntries = [
    {
      ref: { kind: "story-chapter", identity: { id: "chapter-1" } },
      value: { number: 1, title: "谷底激活" },
    },
    {
      ref: { kind: "story-chapter-content", identity: { id: "chapter-1" } },
      value: { kind: "story-chapter-content", id: "chapter-1", content: "# 第一章" },
    },
  ];
  const chapterContent = editableStoryDocument(
    LONG_NOVEL_STORY_TYPE.definition,
    { ...chapterEntries[1], updatedAt: null },
    chapterEntries,
  );
  assert(
    chapterContent.displayName === "第1章 · 谷底激活（正文）",
    "Markdown 正文应从同 identity 的 companion 文档解析章号与标题。",
    chapterContent,
  );

  const recallProject = {
    manifest: { revision: 7 },
    documents: [
      { ref: { kind: "story-book", identity: {} }, value: { id: "book", premise: "雾港调查", goal: "揭开港口真相", protagonistId: "hero" } },
      { ref: { kind: "story-positioning", identity: {} }, value: { id: "positioning", primaryGenre: "都市悬疑", targetAudience: "喜欢高压反转的读者", emotionalPromise: "压迫后反杀", surfaceHook: "身份差", deepPayoff: "真相兑现", benchmarkTitles: ["标杆书"] } },
      { ref: { kind: "story-style", identity: {} }, value: { id: "style", tone: "冷峻克制", sentenceRhythm: "短句用于爆发，长句用于压迫", dialogueGuidance: "用潜台词推进" } },
      { ref: { kind: "story-book-arc", identity: {} }, value: { id: "arc", emotionalArc: "由受压到反击", stages: [{ id: "opening", name: "开篇", phase: "opening", startChapter: 1, endChapter: 10, purpose: "建立危机", emotionalTone: "高压", expectedReaderState: "期待反击", allowedReveals: ["港口异常"], prohibitedReveals: ["终极幕后"] }] } },
      { ref: { kind: "story-volume", identity: { id: "volume-1" } }, value: { id: "volume-1", number: 1, title: "迷雾", startChapter: 1, endChapter: 20, phase: "opening", purpose: "查明失踪", coreConflict: "调查受阻", coreEvent: "进入封锁区", startState: "线索不足", endState: "锁定嫌疑人", emotionalArc: "受压后反击", prohibitedReveals: ["幕后姓名"] } },
      { ref: { kind: "story-chapter-plan", identity: { id: "plan-2" } }, value: { id: "plan-2", number: 2, volumeId: "volume-1", title: "旧章", ending: { nextDrive: "进入仓库" } } },
      { ref: { kind: "story-chapter-plan", identity: { id: "plan-3" } }, value: { id: "plan-3", number: 3, volumeId: "volume-1", title: "仓库反杀", chapterRole: "high-pressure", targetEmotion: "压迫转畅快", coreEvent: "主角用账本反制守卫", structureFormula: "压制→发现→反证→爆发→冷却", openingHook: "仓门落锁", payoff: "公开反证", releaseGuards: ["不得揭露终极幕后"], participantIds: ["hero"], appearanceOrder: ["hero"], worldRefIds: ["warehouse"], beats: [{ id: "beat-1", summary: "发现账本", participantIds: ["hero"], worldRefIds: ["warehouse"] }], ending: { nextDrive: "追查账本来源" }, status: "ready" } },
      { ref: { kind: "story-chapter-plan", identity: { id: "plan-4" } }, value: { id: "plan-4", number: 4, volumeId: "volume-1", title: "FUTURE PLAN SHOULD NOT LOAD", coreEvent: "未来事件" } },
      { ref: { kind: "story-chapter", identity: { id: "chapter-1" } }, value: { id: "chapter-1", planId: "plan-1", number: 1, title: "更早", summary: "初到雾港" } },
      { ref: { kind: "story-chapter", identity: { id: "chapter-2" } }, value: { id: "chapter-2", planId: "plan-2", number: 2, title: "旧章", summary: "主角找到仓库入口" } },
      { ref: { kind: "story-chapter-content", identity: { id: "chapter-1" } }, value: { kind: "story-chapter-content", id: "chapter-1", content: "ANCIENT FULL TEXT SHOULD NOT LOAD" } },
      { ref: { kind: "story-chapter-content", identity: { id: "chapter-2" } }, value: { kind: "story-chapter-content", id: "chapter-2", content: "PREVIOUS FULL TEXT MUST LOAD" } },
      { ref: { kind: "story-character", identity: { id: "hero" } }, value: { id: "hero", name: "沈砚", role: "protagonist", description: "调查员", speakingStyle: "简短直接" } },
      { ref: { kind: "story-character", identity: { id: "irrelevant" } }, value: { id: "irrelevant", name: "IRRELEVANT CHARACTER SHOULD NOT LOAD", role: "minor" } },
      { ref: { kind: "story-character-state", identity: { characterId: "hero" } }, value: { characterId: "hero", asOfChapterId: "chapter-2", identity: "调查员", location: "仓库门口", physicalState: "轻伤", knowledge: ["守卫隐瞒账本"], openThreads: ["账本来源"] } },
      { ref: { kind: "story-world-entry", identity: { id: "warehouse" } }, value: { id: "warehouse", title: "封锁仓库", category: "geography", description: "只有守卫钥匙能打开" } },
      { ref: { kind: "story-world-entry", identity: { id: "forest" } }, value: { id: "forest", title: "IRRELEVANT WORLD SHOULD NOT LOAD", category: "geography" } },
      { ref: { kind: "story-relationships", identity: {} }, value: { id: "relationships", relationships: [{ id: "rel-1", fromCharacterId: "hero", toCharacterId: "guard", type: "敌对", currentState: "互相试探" }, { id: "rel-2", fromCharacterId: "other-a", toCharacterId: "other-b", type: "无关", currentState: "IRRELEVANT RELATIONSHIP SHOULD NOT LOAD" }] } },
      { ref: { kind: "story-foreshadows", identity: {} }, value: { id: "foreshadows", foreshadows: [{ id: "ledger", content: "账本缺页", status: "planted", importance: "high", relatedEntityIds: ["hero", "warehouse"] }, { id: "resolved", content: "IRRELEVANT RESOLVED FORESHADOW", status: "resolved", importance: "high", relatedEntityIds: [] }] } },
      { ref: { kind: "story-timeline", identity: { id: "main" } }, value: { id: "main", calendar: "公历", openingTime: "周一", currentTime: "周三深夜", entries: [{ id: "event-2", chapterId: "chapter-2", storyTime: "周三夜", event: "抵达仓库", participantIds: ["hero"], worldRefIds: ["warehouse"] }, { id: "future", chapterId: "chapter-9", storyTime: "未来", event: "IRRELEVANT TIMELINE SHOULD NOT LOAD", participantIds: ["hero"], worldRefIds: ["warehouse"] }] } },
      { ref: { kind: "story-progress", identity: {} }, value: { id: "progress", lastCompletedChapterId: "chapter-2", currentVolumeId: "volume-1", nextChapterPlanId: "plan-3", recentChapterIds: ["chapter-1", "chapter-2"], notes: ["保持账本来源未知"] } },
      { ref: { kind: "story-analysis", identity: { id: "benchmark-1" } }, value: { id: "benchmark-1", analysisType: "long", target: "benchmark", status: "complete", source: { title: "标杆书", platform: "测试", wordCount: 100000, chapterCount: 100 }, summary: "高压后证据反杀", structureStages: [{ name: "压制爆发", range: "单章", function: "关键信息先压后爆", emotion: "压迫转畅快", evidence: ["第3章"] }], emotionalArc: [{ label: "压迫", intensity: 8, cause: "主角被围堵" }, { label: "释放", intensity: 9, cause: "证据公开" }], plotModules: [{ id: "module-counter", name: "证据反杀", function: "兑现受压后的反击", setup: "先限制行动", payoff: "公开反证", reusablePattern: "压制→证据→反杀", evidence: ["第3章"] }], styleProfile: { pointOfView: "第三人称", tone: "克制", sentenceRhythm: "爆发处缩短", dialogue: "问非所答", proseRules: ["少解释"], anchorExcerpts: ["门闩落下。"] }, reusableTechniques: ["先隐藏关键账目，再让旁观者确认"], gaps: [] } },
      { ref: { kind: "story-analysis", identity: { id: "current-analysis" } }, value: { id: "current-analysis", target: "current-story", status: "complete", summary: "IRRELEVANT CURRENT ANALYSIS SHOULD NOT LOAD" } },
    ],
  } as any;
  const chapterRecall = readStoryProjectContext(recallProject, LONG_NOVEL_STORY_TYPE.definition, {
    scope: "chapter",
    targetId: "plan-3",
  });
  assert(chapterRecall.target?.id === "plan-3", "章节召回应锁定目标细纲。", chapterRecall.target);
  assert(
    ["chapter-brief", "chapter-plan", "story-boundaries", "continuity-state", "previous-chapter"]
      .every((id) => chapterRecall.sections.some((section) => section.id === id)),
    "章节召回应返回原版写前准备的核心语义分区。",
    chapterRecall.sections.map((section) => section.id),
  );
  assert(chapterRecall.text.includes("PREVIOUS FULL TEXT MUST LOAD"), "章节召回应读取且只读取上一章全文。", chapterRecall.text);
  assert(!chapterRecall.text.includes("ANCIENT FULL TEXT SHOULD NOT LOAD"), "章节召回不得加载更早章节全文。", chapterRecall.text);
  assert(!chapterRecall.text.includes("FUTURE PLAN SHOULD NOT LOAD"), "章节召回不得加载未来细纲。", chapterRecall.text);
  assert(!chapterRecall.text.includes("IRRELEVANT CHARACTER SHOULD NOT LOAD"), "章节召回应按 participantIds 筛选角色。", chapterRecall.text);
  assert(!chapterRecall.text.includes("IRRELEVANT WORLD SHOULD NOT LOAD"), "章节召回应按 worldRefIds 筛选设定。", chapterRecall.text);
  assert(!chapterRecall.text.includes("IRRELEVANT RELATIONSHIP SHOULD NOT LOAD"), "章节召回应过滤无关关系。", chapterRecall.text);
  assert(!chapterRecall.text.includes("IRRELEVANT RESOLVED FORESHADOW"), "章节召回应过滤已回收伏笔。", chapterRecall.text);
  assert(!chapterRecall.text.includes("IRRELEVANT TIMELINE SHOULD NOT LOAD"), "章节召回应过滤无关时间线。", chapterRecall.text);
  assert(!chapterRecall.text.includes("IRRELEVANT CURRENT ANALYSIS SHOULD NOT LOAD"), "章节召回应只选择 benchmark 分析。", chapterRecall.text);
  assert(
    chapterRecall.text.includes("selected_emotion_module") &&
      chapterRecall.text.includes("证据反杀") &&
      chapterRecall.text.includes("rhythm_reference") &&
      chapterRecall.text.includes("关键信息先压后爆"),
    "章节写作简报应显式提供原版的情绪模块和节奏参考。",
    chapterRecall.sections.find((section) => section.id === "chapter-brief"),
  );
  assert(
    chapterRecall.sources.some((source) => source.kind === "story-character" && source.id === "hero") &&
      !chapterRecall.sources.some((source) => source.kind === "story-character" && source.id === "irrelevant"),
    "上下文来源也应保持定向筛选，供写作酒馆复用。",
    chapterRecall.sources,
  );
  assert(
    (chapterRecall.sections.find((section) => section.id === "continuity-state")?.content.length ?? 0) <= 12288,
    "续写状态卡应维持固定硬上限，不随章节历史增长。",
  );

  const short = await projects.create("/memory/short", { storyTypeId: "short-novel", storyId: "story-2", title: "雾港一夜" });
  const positioning = (await short.listDocuments()).find((item) => item.ref.kind === "story-positioning")?.value as Record<string, unknown>;
  assert(positioning.lengthType === "short", "短篇类型应组合基础定义并覆写篇幅默认值。", positioning);

  const fileContents = new Map<string, string>();
  const fileKey = (root: string, path: string) => root + "::" + path;
  const fileBackend: StoryFileBackend = {
    async list(root) {
      const prefix = root + "::";
      return [...fileContents.keys()].flatMap((key) => {
        if (!key.startsWith(prefix)) return [];
        const path = key.slice(prefix.length);
        return path.split("/").some((segment) => segment.startsWith("."))
          ? []
          : [{ path, isDirectory: false, updatedAt: null }];
      });
    },
    async read(root, path) {
      const content = fileContents.get(fileKey(root, path));
      if (content === undefined) throw new Error("missing file: " + path);
      return { path, content, updatedAt: null };
    },
    async readOptional(root, path) {
      const content = fileContents.get(fileKey(root, path));
      return content === undefined ? null : { path, content, updatedAt: null };
    },
    async writeAtomic(root, writes, deletes, revision) {
      assertStoryFileRevision(revision, fileContents.get(fileKey(root, revision.key)) ?? null);
      for (const path of deletes) fileContents.delete(fileKey(root, path));
      for (const write of writes) fileContents.set(fileKey(root, write.path), write.content);
    },
  };
  const fileProjects = createStoryProjectApi({ kind: "file", backend: fileBackend });
  await fileProjects.create("/file/hidden", { storyTypeId: "long-novel", storyId: "story-3", title: "隐藏配置" });
  const reopened = await fileProjects.open("/file/hidden");
  assert((await reopened.overview()).title === "隐藏配置", "隐藏配置目录不得导致已初始化项目被误判。" );
  const hiddenDefinitionKey = fileKey("/file/hidden", "story/.isle-claw/project.json");
  const oldDefinition = JSON.parse(fileContents.get(hiddenDefinitionKey)!);
  fileContents.set(hiddenDefinitionKey, JSON.stringify({ ...oldDefinition, formatVersion: 2 }, null, 2) + "\\n");
  const upgradeable = await fileProjects.checkCompatibility("/file/hidden");
  assert(
    upgradeable.status === "upgrade-available" &&
      upgradeable.current?.formatVersion === 2 &&
      upgradeable.target?.formatVersion === 3,
    "旧 Definition format 的文档若能通过当前定义校验，应允许升级。",
    upgradeable,
  );
  const upgraded = await fileProjects.upgrade("/file/hidden");
  assert(upgraded.upgraded && upgraded.compatibility.status === "compatible", "兼容升级应原子替换项目定义。", upgraded);
  assert(
    JSON.parse(fileContents.get(hiddenDefinitionKey)!).formatVersion === 3,
    "升级完成后应写入当前 Definition format。",
  );
  assert((await (await fileProjects.open("/file/hidden")).overview()).title === "隐藏配置", "升级后项目应可正常打开。" );

  await fileProjects.create("/file/incompatible", {
    storyTypeId: "long-novel",
    storyId: "story-incompatible",
    title: "不可升级项目",
  });
  const incompatibleDefinitionKey = fileKey("/file/incompatible", "story/.isle-claw/project.json");
  const incompatibleDefinition = JSON.parse(fileContents.get(incompatibleDefinitionKey)!);
  fileContents.set(
    incompatibleDefinitionKey,
    JSON.stringify({ ...incompatibleDefinition, formatVersion: 2 }, null, 2) + "\\n",
  );
  const incompatibleBookKey = fileKey("/file/incompatible", "story/book.json");
  const incompatibleBook = JSON.parse(fileContents.get(incompatibleBookKey)!);
  fileContents.set(incompatibleBookKey, JSON.stringify({ ...incompatibleBook, legacyField: true }, null, 2) + "\\n");
  const incompatible = await fileProjects.checkCompatibility("/file/incompatible");
  assert(
    incompatible.status === "incompatible" && incompatible.reason?.includes("legacyField"),
    "不满足当前文档结构的项目必须明确返回不可升级原因。",
    incompatible,
  );
  const rejectedUpgrade = await fileProjects.upgrade("/file/incompatible");
  assert(!rejectedUpgrade.upgraded, "不兼容项目不得写入任何升级结果。", rejectedUpgrade);
  assert(
    JSON.parse(fileContents.get(incompatibleDefinitionKey)!).formatVersion === 2,
    "升级被拒绝后必须保留原项目定义。",
  );
  await fileProjects.create("/file/short", { storyTypeId: "short-novel", storyId: "story-4", title: "短篇独立布局" });
  const reopenedShort = await fileProjects.open("/file/short");
  const shortDescription = await reopenedShort.describe({ documentKinds: ["story-positioning"] });
  const shortPositioning = (await reopenedShort.listDocuments()).find((item) => item.ref.kind === "story-positioning")?.value as Record<string, unknown>;
  assert(shortDescription.storyType.version === 1, "File Storage 应按短篇自身版本重新分发布局。", shortDescription.storyType);
  assert(shortPositioning.lengthType === "short", "重新打开短篇项目后应保持短篇自身定义。", shortPositioning);
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
