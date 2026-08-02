import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const root = process.cwd();
const entry = resolve(root, "core/story-project/story-types/long-novel/index.ts");
const shortEntry = resolve(root, "core/story-project/story-types/short-novel/index.ts");
const definitionEntry = resolve(root, "core/story-project/definitions/index.ts");
const output = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { LONG_NOVEL_STORY_TYPE: longStoryType } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);
const shortOutput = await build({
  entryPoints: [shortEntry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { SHORT_NOVEL_STORY_TYPE: shortStoryType } = await import(
  `data:text/javascript;base64,${Buffer.from(shortOutput.outputFiles[0].text).toString("base64")}`
);
const storyType = longStoryType.definition;
const fileLayout = longStoryType.storage.file.layout;
const definitionOutput = await build({
  entryPoints: [definitionEntry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { StoryDefinition } = await import(
  `data:text/javascript;base64,${Buffer.from(definitionOutput.outputFiles[0].text).toString("base64")}`
);
const expectedPaths = {
  "story-manifest": "story/manifest.json",
  "story-book": "story/book.json",
  "story-positioning": "story/positioning.json",
  "story-style": "story/style.json",
  "story-character": "story/characters/{id}.json",
  "story-relationships": "story/relationships.json",
  "story-world-entry": "story/world/{id}.json",
  "story-book-arc": "story/outline/book-arc.json",
  "story-volume": "story/outline/volumes/{id}.json",
  "story-chapter-plan": "story/outline/chapters/{id}.json",
  "story-chapter": "story/tracking/chapter-results/{id}.json",
  "story-chapter-content": "story/chapters/{id}.md",
  "story-character-state": "story/tracking/character-states/{characterId}.json",
  "story-foreshadows": "story/tracking/foreshadows.json",
  "story-timeline": "story/tracking/timeline/{id}.json",
  "story-progress": "story/tracking/progress.json",
  "story-analysis": "story/analysis/{id}.json",
  "story-review": "story/reviews/{id}.json",
  "story-import": "story/imports/{id}.json",
};

assert.equal(StoryDefinition.format, "isle-claw.story-type-definition");
assert.equal(StoryDefinition.formatVersion, 3);
assert.equal(storyType.$format, StoryDefinition.format);
assert.equal(storyType.formatVersion, StoryDefinition.formatVersion);
assert.equal(storyType.id, "long-novel");
assert.equal(storyType.version, 4);
assert.equal(shortStoryType.definition.id, "short-novel");
assert.equal(shortStoryType.definition.version, 1);
assert.notEqual(shortStoryType.definition, storyType, "短篇必须拥有独立的 Story Type Definition");
assert.notEqual(shortStoryType.storage.file.layout, fileLayout, "短篇必须拥有独立的 File Layout");
assert.equal(
  shortStoryType.definition.documents
    .find((document) => document.kind === shortStoryType.definition.roles.positioning)
    .fields.find((field) => field.key === "lengthType").default,
  "short",
);
assert.ok(!("rootPath" in storyType));
assert.ok(storyType.documents.every((document) => !("pathPattern" in document)));
assert.deepEqual(fileLayout.documentPaths, expectedPaths, "文件路径映射应由 File Storage Layout 独立配置");
assert.deepEqual(fileLayout.managedRoots, ["story"]);
assert.equal(storyType.roles.manifest, storyType.manifestKind);
assert.equal(storyType.roles.primary, storyType.primaryKind);
const primaryDocument = storyType.documents.find((document) => document.kind === storyType.roles.primary);
assert.ok(primaryDocument);
assert.ok(
  !primaryDocument.fields.some((field) => field.key === "playerName" || field.key === "mode"),
  "作品核心不应声明玩家称呼或故事模式",
);
assert.ok(
  !storyType.documents.some((document) => document.kind === "story-scene" || document.kind === "story-graph"),
  "小说故事类型不应包含旧互动剧情文档",
);
assert.ok(
  !storyType.objects.some((object) => ["graph-node", "graph-edge", "scene-status"].includes(object.id)),
  "小说故事类型不应包含旧互动剧情对象",
);
for (const [role, kind] of Object.entries(storyType.roles)) {
  assert.ok(
    storyType.documents.some((document) => document.kind === kind),
    `语义角色 ${role} 引用了未知文档 ${kind}`,
  );
}
for (const context of storyType.contexts) {
  for (const kind of context.documentKinds) {
    assert.ok(
      storyType.documents.some((document) => document.kind === kind),
      `${context.name} 引用了未知文档 ${kind}`,
    );
  }
}
for (const document of storyType.documents) {
  assert.ok(["one", "many"].includes(document.cardinality));
  assert.ok(["structured", "markdown"].includes(document.contentFormat));
  assert.equal(document.identityFields.length > 0, document.cardinality === "many");
  assert.ok(
    document.fields.every((field) => field.key && field.label && field.type),
    `${document.kind} 字段定义不完整`,
  );
}
const chapterContent = storyType.documents.find((document) => document.kind === storyType.roles.chapterContent);
assert.equal(chapterContent.contentFormat, "markdown");
assert.deepEqual(chapterContent.companionKinds, [storyType.roles.chapterResult]);
assert.deepEqual(chapterContent.display, {
  template: "第{number}章 · {title}",
  sourceKind: storyType.roles.chapterResult,
  suffix: "正文",
});
assert.deepEqual(
  StoryDefinition.parseDocument(storyType, "# 第一章", {
    kind: chapterContent.kind,
    identity: { id: "chapter-1" },
  }),
  { kind: chapterContent.kind, id: "chapter-1", content: "# 第一章" },
  "Markdown 文档应由逻辑引用提供身份，不依赖文件路径",
);
assert.ok(
  storyType.objects.find((object) => object.id === "foreshadow")?.fields.some((field) => field.key === "resolution"),
);
assert.deepEqual(Object.keys(storyType.validationModes), ["draft", "openBook", "chapterWrite"]);
const brokenType = structuredClone(storyType);
brokenType.roles.primary = "story-book-typo";
assert.throws(() => StoryDefinition.define(brokenType), /未知文档/, "故事类型组合时应立即拒绝拼错的语义角色");
const mutableIdentityType = structuredClone(storyType);
mutableIdentityType.documents
  .find((document) => document.kind === "story-character")
  .fields.find((field) => field.key === "id").immutable = false;
assert.throws(() => StoryDefinition.define(mutableIdentityType), /required 且 immutable/, "文档身份字段必须保持不可变");
const unknownDisplayFieldType = structuredClone(storyType);
unknownDisplayFieldType.documents.find((document) => document.kind === "story-character").display.template =
  "{nickname}";
assert.throws(
  () => StoryDefinition.define(unknownDisplayFieldType),
  /未定义的字段.*nickname/,
  "实例显示规则只能引用来源文档已定义的字段",
);
console.log(
  `[story-contract] ok (${storyType.documents.length} documents, ${storyType.objects.length} object definitions)`,
);
