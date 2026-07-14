import assert from "node:assert/strict";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const profilePath = resolve(root, "core/story-project/story-types/long-novel/profile.ts");
const layoutPath = resolve(root, "core/story-project/story-types/long-novel/layout.ts");
const identifiersPath = resolve(root, "core/story-project/identifiers.ts");
const profileModule = await build({
  entryPoints: [profilePath],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
});
const { LONG_NOVEL_PROFILE_SOURCE: contract } = await import(
  `data:text/javascript;base64,${Buffer.from(profileModule.outputFiles[0].text).toString("base64")}`
);
const identifiersModule = await build({
  entryPoints: [identifiersPath],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
});
const { STORY_PROJECT_IDENTIFIERS: identifiers } = await import(
  `data:text/javascript;base64,${Buffer.from(identifiersModule.outputFiles[0].text).toString("base64")}`
);
const layoutModule = await build({
  entryPoints: [layoutPath],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
});
const layout = (
  await import(`data:text/javascript;base64,${Buffer.from(layoutModule.outputFiles[0].text).toString("base64")}`)
).LONG_NOVEL_LAYOUT;

const expectedDocumentPaths = {
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
  "story-scene": "story/interactive/scenes/{id}.json",
  "story-graph": "story/interactive/graph.json",
  "story-analysis": "story/analysis/{id}.json",
  "story-review": "story/reviews/{id}.json",
  "story-import": "story/imports/{id}.json",
};
assert.equal(contract.$format, identifiers.declarativeProfile.format);
assert.equal(contract.profileId, "novel-claw.story.long-novel");
assert.equal(contract.profileVersion, 1);
assert.equal(contract.schemaVersion, identifiers.declarativeProfile.schemaVersion);
assert.equal(contract.rootPath, undefined, "Profile 不应决定文件根目录");
assert.equal(contract.documentEncoding, undefined, "标准 Profile 不应声明持久化信封格式");
assert.equal(layout.profile.id, contract.profileId);
assert.equal(layout.profile.version, contract.profileVersion);
assert.deepEqual(
  Object.keys(contract.documents).sort(),
  Object.keys(expectedDocumentPaths).sort(),
  "contract 必须且只能覆盖故事 toolkit 的全部文档类型",
);
assert.equal(contract.skillBindings, undefined, "故事产品协议不得绑定某个技能集合");
assert.equal(contract.contextViews["project-summary"].scope, "project");
assert.equal(contract.contextViews["chapter-writing"].scope, "chapter");
assert.equal(contract.contextViews["chapter-writing"].targetKind, "story-chapter-plan");
assert.equal(contract.documentRoles.manifest, contract.manifestKind);
assert.equal(contract.documentRoles.primary, contract.primaryKind);
assert.equal(contract.documentRoles.chapterPlan, "story-chapter-plan");
assert.equal(contract.documentRoles.chapterContent, "story-chapter-content");
assert.equal(contract.documentRoles.chapterResult, "story-chapter");
for (const [role, kind] of Object.entries(contract.documentRoles)) {
  assert.ok(contract.documents[kind], `文档角色 ${role} 引用了未知文档类型 ${kind}`);
}
for (const view of Object.values(contract.contextViews)) {
  for (const kind of view.documentKinds) {
    assert.ok(contract.documents[kind], `${view.label} 引用了未知文档类型 ${kind}`);
  }
}

const fieldTypes = new Set(Object.keys(contract.fieldTypes));
const objectDefinitions = new Set(Object.keys(contract.objectDefinitions));
const documentKinds = new Set(Object.keys(contract.documents));
const fieldSets = new Set(Object.keys(contract.commonFieldSets));
const validationRules = new Set(Object.keys(contract.validationRules));

const validateRuleIds = (owner, ruleIds = []) => {
  for (const ruleId of ruleIds) {
    assert.ok(validationRules.has(ruleId), `${owner} 引用了不存在的校验规则 ${ruleId}`);
  }
};

const validateFields = (owner, fields) => {
  assert.ok(fields && typeof fields === "object" && !Array.isArray(fields), `${owner} 必须定义 fields`);
  for (const [pointer, field] of Object.entries(fields)) {
    assert.ok(pointer.startsWith("/"), `${owner}.${pointer} 必须使用 JSON Pointer`);
    assert.ok(fieldTypes.has(field.type), `${owner}.${pointer} 使用了未知字段类型 ${field.type}`);
    assert.equal(typeof field.label, "string", `${owner}.${pointer} 必须提供 label`);
    assert.ok(field.label.length > 0, `${owner}.${pointer} 的 label 不得为空`);
    if (field.definition) {
      assert.ok(objectDefinitions.has(field.definition), `${owner}.${pointer} 引用了未知对象定义 ${field.definition}`);
    }
    if (field.itemDefinition) {
      assert.ok(
        objectDefinitions.has(field.itemDefinition),
        `${owner}.${pointer} 引用了未知集合项定义 ${field.itemDefinition}`,
      );
    }
    for (const targetKind of field.targetKinds ?? []) {
      assert.ok(documentKinds.has(targetKind), `${owner}.${pointer} 引用了未知文档类型 ${targetKind}`);
    }
    for (const targetDefinition of field.targetObjectDefinitions ?? []) {
      assert.ok(objectDefinitions.has(targetDefinition), `${owner}.${pointer} 引用了未知对象定义 ${targetDefinition}`);
    }
  }
};

for (const [name, definition] of Object.entries(contract.objectDefinitions)) {
  validateFields(`objectDefinitions.${name}`, definition.fields);
  validateRuleIds(`objectDefinitions.${name}`, definition.ruleIds);
}

for (const [name, fieldSet] of Object.entries(contract.commonFieldSets)) {
  validateFields(`commonFieldSets.${name}`, fieldSet);
}

for (const [kind, document] of Object.entries(contract.documents)) {
  assert.equal(layout.documents[kind]?.pathPattern, expectedDocumentPaths[kind], `${kind} 的布局路径不一致`);
  assert.equal(document.pathPattern, undefined, `${kind} 的 Profile 不应决定文件路径`);
  assert.ok(["required", "optional"].includes(document.layoutPresence), `${kind} 必须声明布局必要性`);
  assert.ok(["one", "many"].includes(document.cardinality), `${kind} 必须定义合法 cardinality`);
  validateFields(`documents.${kind}`, document.fields);
  for (const fieldSet of document.fieldSets ?? []) {
    assert.ok(fieldSets.has(fieldSet), `${kind} 引用了未知公共字段集 ${fieldSet}`);
  }
  validateRuleIds(`documents.${kind}`, document.ruleIds);
  const directKind = document.fields["/kind"]?.const;
  const inheritedKind = document.constFields?.["/kind"];
  assert.equal(directKind ?? inheritedKind, kind, `${kind} 必须稳定声明自身 kind`);
}

assert.deepEqual(
  Object.entries(contract.documents)
    .filter(([, document]) => document.layoutPresence === "optional")
    .map(([kind]) => kind)
    .sort(),
  ["story-analysis", "story-import", "story-review"],
  "辅助产物应作为可被 Layout 关闭的可选文档",
);

assert.deepEqual(
  contract.documents["story-chapter"].companionKinds,
  ["story-chapter-content"],
  "章节结果应声明配套 Markdown 正文",
);
assert.deepEqual(
  contract.documents["story-chapter-content"].companionKinds,
  ["story-chapter"],
  "Markdown 正文应声明配套章节结果",
);

for (const [name, profile] of Object.entries(contract.validationProfiles)) {
  validateRuleIds(`validationProfiles.${name}`, profile.ruleIds);
}

const backgroundOption = contract.documents["story-world-entry"].fields["/category"].options.find(
  (option) => option.value === "background",
);
assert.equal(backgroundOption?.label, "时代与故事背景", "世界设定必须明确支持故事背景");

const foreshadowFields = contract.objectDefinitions.foreshadow.fields;
for (const pointer of [
  "/plannedPlantChapterId",
  "/plantedChapterId",
  "/expectedResolveChapterId",
  "/resolvedChapterId",
  "/resolution",
]) {
  assert.ok(foreshadowFields[pointer], `伏笔协议缺少生命周期字段 ${pointer}`);
}
assert.ok(
  foreshadowFields["/status"].options.some((option) => option.value === "resolved"),
  "伏笔协议必须支持已回收状态",
);

console.log(
  `[story-contract] ok (${documentKinds.size} documents, ${objectDefinitions.size} object definitions, ${validationRules.size} rules)`,
);
