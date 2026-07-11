import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contractPath = resolve(root, "agent-runtime/src/engines/builtins/story/contract.json");
const schemaPath = resolve(root, "agent-runtime/src/engines/builtins/story/tool/schema.ts");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const schemaSource = readFileSync(schemaPath, "utf8");

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
  "story-chapter": "story/chapters/{id}.json",
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
const expectedSkillNames = [
  "story-assistant",
  "story-assistant-long-write",
  "story-assistant-long-analyze",
  "story-assistant-short-write",
  "story-assistant-short-analyze",
  "story-assistant-deslop",
  "story-assistant-import",
  "story-assistant-review",
];

assert.equal(contract.$format, "novel-claw.structured-document-contract");
assert.equal(contract.contractId, "novel-claw.story-authoring");
assert.equal(contract.contractVersion, 1);
assert.equal(contract.capability, "novel-claw.structured-story@1");
assert.equal(contract.schemaVersion, 1);
assert.equal(contract.rootPath, "story");
assert.equal(contract.documentEncoding.format, "novel-claw.structured-document");
assert.equal(contract.documentEncoding.dataPointer, "/data");
assert.deepEqual(
  Object.keys(contract.documents).sort(),
  Object.keys(expectedDocumentPaths).sort(),
  "contract 必须且只能覆盖故事 toolkit 的全部文档类型",
);
assert.deepEqual(
  Object.keys(contract.skillBindings).sort(),
  expectedSkillNames.sort(),
  "contract 必须映射完整的 story-authoring 专属技能集合",
);

const schemaMapSource = schemaSource
  .split("export const storyProjectFileSchemasByKind = {")[1]
  ?.split("} as const;")[0];
assert.ok(schemaMapSource, "无法定位 storyProjectFileSchemasByKind");
const schemaKinds = [...schemaMapSource.matchAll(/"(story-[a-z-]+)"\s*:/g)].map((match) => match[1]).sort();
assert.deepEqual(schemaKinds, Object.keys(expectedDocumentPaths).sort(), "contract 文档类型必须与 Zod schema 同步");

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
  assert.equal(document.pathPattern, expectedDocumentPaths[kind], `${kind} 的文件路径与 toolkit 不一致`);
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

for (const [name, profile] of Object.entries(contract.validationProfiles)) {
  validateRuleIds(`validationProfiles.${name}`, profile.ruleIds);
}

for (const [skillName, binding] of Object.entries(contract.skillBindings)) {
  for (const kind of binding.documentKinds) {
    assert.ok(documentKinds.has(kind), `${skillName} 映射了未知文档类型 ${kind}`);
  }
  for (const profile of binding.validationProfiles) {
    assert.ok(contract.validationProfiles[profile], `${skillName} 映射了未知校验阶段 ${profile}`);
  }
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
