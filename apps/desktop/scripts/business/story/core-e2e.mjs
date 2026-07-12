import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-core-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const changeSetPath = resolve(workspaceRoot, "protocols/story-project/formats/structured-novel-v1/change-set.ts");
const projectPath = resolve(workspaceRoot, "protocols/story-project/formats/structured-novel-v1/project.ts");
const validationPath = resolve(workspaceRoot, "protocols/story-project/formats/structured-novel-v1/validation.ts");
const contractCompilerPath = resolve(workspaceRoot, "protocols/story-project/index.ts");
const defaultContractPath = resolve(workspaceRoot, "src/features/pages/stories/contracts/default-novel/contract.json");
const documentModelPath = resolve(workspaceRoot, "src/features/pages/stories/documents/model.ts");

writeFileSync(
  entryPath,
  `
  import {
    applyStoryChangeSet,
    STORY_CHANGE_SET_MAX_BYTES,
    STORY_CHANGE_SET_MAX_OPERATIONS,
    storyChangeSetSchema,
  } from ${JSON.stringify(changeSetPath)};
  import { createEmptyStoryProject, storyProjectFiles, withRebuiltManifest } from ${JSON.stringify(projectPath)};
  import { validateStoryProject } from ${JSON.stringify(validationPath)};
  import defaultContractJson from ${JSON.stringify(defaultContractPath)};
  import { createStoryContractCompilerRegistry } from ${JSON.stringify(contractCompilerPath)};
  import { inspectStructuredJsonDocument, storyDocumentsToStoryJson } from ${JSON.stringify(documentModelPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const timestamp = 1_800_000_000_000;
  const contract = createStoryContractCompilerRegistry().compile(defaultContractJson);
  const changeSetContract = { contractId: "novel-claw.story.default-novel" as const, contractVersion: 1 as const };
  const initial = createEmptyStoryProject({ id: "story-contract", title: "雾港档案", timestamp, contract });
  const frontendDocument = {
    path: "story/book.json",
    updatedAt: timestamp,
    value: {
      $document: { kind: "story-book", label: "作品核心", path: "story/book.json" },
      $schema: { fields: { "/title": { type: "text", label: "书名", required: true } } },
      data: { kind: "story-book", id: "story-contract", title: "雾港档案", premise: "港口迷雾中的调查。", goal: "查明真相", playerName: "我", createdAt: timestamp },
    },
  };
  assert(inspectStructuredJsonDocument(frontendDocument)?.fields["/title"]?.label === "书名", "通用编辑器应直接读取 JSON 内嵌字段元数据。");
  const encodedGraph = contract.encodeDocument(initial.graph, "story/interactive/graph.json");
  const inspectedGraph = inspectStructuredJsonDocument({ path: "story/interactive/graph.json", value: encodedGraph, updatedAt: timestamp });
  assert(
    inspectedGraph?.fields["/nodes"]?.itemDefinition === "graph-node" && inspectedGraph.definitions["graph-node"]?.fields["/title"]?.label === "节点标题",
    "通用编辑器应读取嵌套对象定义并递归生成集合表单。",
    inspectedGraph,
  );
  const frontendStory = storyDocumentsToStoryJson({ id: "story-contract", name: "回退标题", createdAt: timestamp, updatedAt: timestamp }, [frontendDocument]);
  assert(frontendStory.title === "雾港档案" && frontendStory.scenes.length === 0, "前端只能尽力投影 JSON，不得创建未落库的故事内容。", frontendStory);
  const initialValidation = validateStoryProject(initial, contract, "draft");
  assert(initialValidation.valid, "新故事应满足 draft 结构校验。", initialValidation);
  assert(
    storyProjectFiles(initial, contract).some((file) => file.path === "story/book.json") &&
      storyProjectFiles(initial, contract).some((file) => file.path === "story/interactive/graph.json") &&
      !storyProjectFiles(initial, contract).some((file) => file.path === "story/story.json"),
    "故事应拆分为 v1 JSON 文件，不能继续生成 story.json。",
    storyProjectFiles(initial, contract).map((file) => file.path),
  );

  const character = {
    schemaVersion: 1 as const,
    kind: "story-character" as const,
    id: "char-protagonist",
    name: "林砚",
    role: "protagonist" as const,
    avatar: "blank-avatar",
    age: "24",
    description: "能看见谎言颜色的调查员。",
    traits: ["克制", "执拗"],
    speakingStyle: "简短，先问证据。",
    writingStyle: "",
    replyStylePrompt: "",
    goals: "找出导师隐瞒的真相。",
    motivation: "洗清父亲的嫌疑。",
    flaw: "不信任任何人。",
    coreAbility: "看见谎言颜色。",
    relationshipSummary: "",
    publicRelationshipSummary: "",
    arcSummary: "从孤立调查到学会合作。",
    memory: { required: "", public: "", known: "", privateSelf: "", directorSecret: "" },
    updatedAt: timestamp,
  };
  const plans = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    const id = "ch-" + String(number).padStart(3, "0");
    return {
      schemaVersion: 1 as const,
      kind: "story-chapter-plan" as const,
      id,
      number,
      volumeId: "vol-001",
      title: "第 " + number + " 章",
      phase: "opening" as const,
      phasePosition: "开篇期第 " + number + " 章",
      chapterRole: "progress" as const,
      targetWords: 1000,
      targetEmotion: "压迫后的期待",
      coreEvent: "林砚获得一条新的调查线索。",
      structureFormula: "发现 + 试探 + 受阻 + 新线索",
      openingHook: "异常颜色",
      payoff: "确认线索有效",
      releaseGuards: ["不揭示幕后主使"],
      summary: { cause: "调查推进", development: "试探证人", turn: "证词冲突", climax: "颜色暴露", ending: "获得新线索" },
      plotLines: { main: "调查推进", secondary: "", event: "证词核对", relationship: "", logic: "发现→试探→证实" },
      participantIds: [character.id],
      appearanceOrder: [character.id],
      worldRefIds: [],
      pointOfView: "第三人称限知",
      informationGap: "读者知道证人在说谎，林砚不知道原因。",
      relationshipChanges: [],
      beats: [{ id: "beat-" + id, summary: "林砚识别谎言", function: "information-reveal" as const, density: "dense" as const, wordBudget: 1000, participantIds: [character.id], worldRefIds: [] }],
      costAndPayoff: "暴露能力风险，换取线索。",
      ending: { resolvedState: "确认说谎", unresolvedQuestion: "为何说谎", nextDrive: "追查证词来源", hookType: "information-gap", hookStrength: "medium" as const },
      status: "ready" as const,
      updatedAt: timestamp,
    };
  });
  const ready = withRebuiltManifest({
    ...initial,
    book: { ...initial.book, logline: "能看见谎言颜色的调查员追查导师秘密。", centralConflict: "真相与信任冲突", protagonistId: character.id },
    positioning: { ...initial.positioning, primaryGenre: "都市异能", targetPlatform: "番茄", emotionalPromise: "压迫后反杀", targetWords: 800000 },
    characters: [character],
    bookArc: {
      ...initial.bookArc,
      totalChapters: 10,
      targetWords: 800000,
      emotionalArc: "压迫→试探→反杀→余韵",
      stages: [{ id: "stage-opening", name: "开篇期", phase: "opening" as const, startChapter: 1, endChapter: 10, purpose: "建立能力与主线", emotionalTone: "压迫与期待", expectedReaderState: "期待反杀", allowedReveals: [], prohibitedReveals: ["幕后主使"] }],
      volumeIds: ["vol-001"],
    },
    volumes: [{ schemaVersion: 1 as const, kind: "story-volume" as const, id: "vol-001", number: 1, title: "谎言之色", startChapter: 1, endChapter: 10, targetWords: 30000, phase: "opening" as const, purpose: "建立能力", coreConflict: "导师隐瞒真相", coreEvent: "主角确认导师说谎", startState: "孤立", endState: "掌握线索", emotionalArc: "压迫到反击", allowedReveals: [], prohibitedReveals: ["幕后主使"], chapterIds: plans.map((plan) => plan.id), updatedAt: timestamp }],
    chapterPlans: plans,
  }, contract, { revision: initial.manifest.revision + 1, timestamp });
  const openingValidation = validateStoryProject(ready, contract, "openBook");
  assert(openingValidation.valid, "完整开书项目应通过 openBook 校验。", openingValidation);

  const nextBook = { ...ready.book, title: "谎言留痕", updatedAt: timestamp + 1 };
  const changed = applyStoryChangeSet(ready, {
    ...changeSetContract,
    storyId: ready.manifest.storyId,
    baseRevision: ready.manifest.revision,
    validationProfile: "draft",
    operations: [{ type: "upsert", path: "story/book.json", value: nextBook }],
  }, contract);
  assert(changed.book.title === "谎言留痕" && changed.manifest.revision === ready.manifest.revision + 1, "ChangeSet 应更新内容和 revision。", changed.manifest);

  const patched = applyStoryChangeSet(changed, {
    ...changeSetContract,
    storyId: changed.manifest.storyId,
    baseRevision: changed.manifest.revision,
    validationProfile: "draft",
    batch: { workflowId: "open-book-test", index: 1, total: 2, label: "更新核心设定", final: false },
    operations: [
      { type: "patch", path: "story/book.json", value: { premise: "一条只更新局部字段的新前提。" } },
      { type: "append-text", path: "story/book.json", field: "premise", value: "后续只追加这一句。", separator: "\\n" },
      { type: "replace-text", path: "story/book.json", field: "premise", oldText: "新前提", newText: "新设定" },
      { type: "add-values", path: "story/outline/book-arc.json", field: "volumeIds", values: ["vol-001"] },
    ],
  }, contract);
  assert(
    patched.book.title === changed.book.title && patched.book.premise === "一条只更新局部字段的新设定。\\n后续只追加这一句。",
    "patch/append-text/replace-text 应保留未提交字段，并支持局部追加与替换。",
    patched.book,
  );
  assert(patched.bookArc.volumeIds.length === 1, "add-values 应去重，不能重复追加引用。", patched.bookArc);

  const tooManyOperations = storyChangeSetSchema.safeParse({
    ...changeSetContract,
    storyId: patched.manifest.storyId,
    baseRevision: patched.manifest.revision,
    validationProfile: "draft",
    operations: Array.from({ length: STORY_CHANGE_SET_MAX_OPERATIONS + 1 }, () => ({
      type: "patch",
      path: "story/book.json",
      value: { premise: "拆批" },
    })),
  });
  assert(!tooManyOperations.success, "超出单批操作上限的 ChangeSet 必须被拒绝并要求拆批。");
  const oversizedChangeSet = storyChangeSetSchema.safeParse({
    ...changeSetContract,
    storyId: patched.manifest.storyId,
    baseRevision: patched.manifest.revision,
    validationProfile: "draft",
    operations: [{ type: "append-text", path: "story/book.json", field: "premise", value: "字".repeat(STORY_CHANGE_SET_MAX_BYTES) }],
  });
  assert(!oversizedChangeSet.success, "超出字节上限的 ChangeSet 必须被拒绝并要求拆批。");

  const assistantArtifacts = applyStoryChangeSet(patched, {
    ...changeSetContract,
    storyId: patched.manifest.storyId,
    baseRevision: patched.manifest.revision,
    validationProfile: "draft",
    operations: [
      {
        type: "upsert",
        path: "story/analysis/analysis-benchmark.json",
        value: {
          schemaVersion: 1,
          kind: "story-analysis",
          id: "analysis-benchmark",
          analysisType: "long",
          target: "benchmark",
          status: "complete",
          source: { title: "对标样本", platform: "番茄", wordCount: 30000, chapterCount: 10 },
          summary: "分析摘要",
          storyCore: "谎言能力驱动的调查反杀",
          structureStages: [],
          turningPoints: [],
          emotionalArc: [],
          plotModules: [],
          styleProfile: { pointOfView: "第三人称限知", tone: "克制", sentenceRhythm: "短句", dialogue: "信息差", proseRules: [], anchorExcerpts: [] },
          characterInsights: [],
          worldInsights: [],
          reusableTechniques: [],
          gaps: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
      {
        type: "upsert",
        path: "story/reviews/review-opening.json",
        value: {
          schemaVersion: 1,
          kind: "story-review",
          id: "review-opening",
          reviewType: "review",
          mode: "lean",
          rubric: "fanqie",
          scopePaths: ["story/outline/chapters/ch-001.json"],
          summary: "开篇结构可继续优化。",
          verdict: "concerns",
          findings: [{ id: "finding-001", severity: "S3", category: "structure", scopePath: "story/outline/chapters/ch-001.json", evidence: "章尾期待偏弱", issue: "下一章驱动力不够具体", fix: "明确下一步调查对象", status: "open" }],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
      {
        type: "upsert",
        path: "story/imports/import-source.json",
        value: {
          schemaVersion: 1,
          kind: "story-import",
          id: "import-source",
          sourceTitle: "对标样本",
          lengthType: "long",
          status: "committed",
          wordCount: 30000,
          chapterCount: 10,
          lastCompleteChapterNumber: 10,
          analysisId: "analysis-benchmark",
          generatedFileIds: [patched.book.id],
          warnings: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
  }, contract);
  assert(assistantArtifacts.analyses.length === 1 && assistantArtifacts.reviews.length === 1 && assistantArtifacts.imports.length === 1, "故事助手分析、审查和导入记录应进入结构化项目。", assistantArtifacts);
  assert(storyProjectFiles(assistantArtifacts, contract).some((file) => file.path === "story/analysis/analysis-benchmark.json"), "故事助手产物应生成独立 JSON 文件。");

  const incrementallyReviewed = applyStoryChangeSet(assistantArtifacts, {
    ...changeSetContract,
    storyId: assistantArtifacts.manifest.storyId,
    baseRevision: assistantArtifacts.manifest.revision,
    validationProfile: "draft",
    batch: { workflowId: "review-test", index: 2, total: 2, label: "追加审查问题", final: true },
    operations: [{
      type: "upsert-items",
      path: "story/reviews/review-opening.json",
      field: "findings",
      items: [{ id: "finding-001", severity: "S2", fix: "在章尾明确下一位调查对象与期限" }],
    }],
  }, contract);
  assert(
    incrementallyReviewed.reviews[0]?.findings[0]?.severity === "S2" &&
      incrementallyReviewed.reviews[0]?.findings[0]?.issue === "下一章驱动力不够具体",
    "upsert-items 应按 id 合并数组条目并保留未提交字段。",
    incrementallyReviewed.reviews[0],
  );

  let rejected = false;
  try {
    applyStoryChangeSet(incrementallyReviewed, {
      ...changeSetContract,
      storyId: incrementallyReviewed.manifest.storyId,
      baseRevision: incrementallyReviewed.manifest.revision - 1,
      validationProfile: "draft",
      operations: [],
    }, contract);
  } catch {
    rejected = true;
  }
  assert(rejected, "过期 revision 的 ChangeSet 必须被拒绝。");
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
    alias: {
      "@": resolve(workspaceRoot, "src"),
      "@engines/native/agent": resolve(workspaceRoot, "agent-runtime/src/engines/drivers/native/agent"),
    },
    loader: {
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".png": "dataurl",
      ".svg": "dataurl",
      ".webp": "dataurl",
    },
  });
  await import(pathToFileURL(bundledPath).href);
  console.log("[story-core] ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
