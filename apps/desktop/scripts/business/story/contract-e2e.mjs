import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const root = process.cwd();
const entry = resolve(root, "core/story-project/story-types/long-novel/index.ts");
const definitionEntry = resolve(root, "core/story-project/definitions/index.ts");
const output = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { LONG_NOVEL_STORY_TYPE: storyType } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);
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

assert.equal(StoryDefinition.format, "novel-claw.story-type-definition");
assert.equal(StoryDefinition.formatVersion, 1);
assert.equal(storyType.$format, StoryDefinition.format);
assert.equal(storyType.formatVersion, StoryDefinition.formatVersion);
const legacyStoryType = structuredClone(storyType);
legacyStoryType.$format = "novel-claw.story-project";
assert.equal(StoryDefinition.parse(legacyStoryType).$format, StoryDefinition.format);
assert.equal(storyType.id, "long-novel");
assert.equal(storyType.version, 3);
assert.equal(storyType.rootPath, "story");
assert.deepEqual(
  Object.fromEntries(storyType.documents.map((document) => [document.kind, document.pathPattern])),
  expectedPaths,
  "故事类型应在一个定义中组合文档结构与实际路径",
);
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
  assert.ok(["json", "markdown"].includes(document.contentType));
  assert.ok(
    document.fields.every((field) => field.key && field.label && field.type),
    `${document.kind} 字段定义不完整`,
  );
}
const chapterContent = storyType.documents.find((document) => document.kind === storyType.roles.chapterContent);
assert.equal(chapterContent.contentType, "markdown");
assert.deepEqual(chapterContent.companionKinds, [storyType.roles.chapterResult]);
assert.ok(
  storyType.objects.find((object) => object.id === "foreshadow")?.fields.some((field) => field.key === "resolution"),
);
assert.deepEqual(Object.keys(storyType.validationModes), ["draft", "openBook", "chapterWrite"]);
const brokenType = structuredClone(storyType);
brokenType.roles.primary = "story-book-typo";
assert.throws(() => StoryDefinition.define(brokenType), /未知文档/, "故事类型组合时应立即拒绝拼错的语义角色");
console.log(
  `[story-contract] ok (${storyType.documents.length} documents, ${storyType.objects.length} object definitions)`,
);
