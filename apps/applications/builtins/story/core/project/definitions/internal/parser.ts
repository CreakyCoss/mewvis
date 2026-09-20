import { defineFields } from "../model/fields.js";
import type {
  StoryDocumentDefinition,
  StoryDocumentDisplayDefinition,
  StoryFieldDefinition,
  StoryFieldType,
  StoryObjectDefinition,
} from "../model/types.js";
import {
  STORY_TYPE_DEFINITION_FORMAT,
  STORY_TYPE_DEFINITION_FORMAT_VERSION,
  type StoryContextDefinition,
  type StoryTypeDefinition,
} from "../types.js";

type JsonObject = Record<string, unknown>;

const objectValue = (value: unknown, owner: string): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${owner} 必须是对象。`);
  return value as JsonObject;
};

const nonEmptyString = (value: unknown, owner: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${owner} 必须是非空字符串。`);
  return value.trim();
};

const positiveInteger = (value: unknown, owner: string) => {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${owner} 必须是正整数。`);
  return Number(value);
};

const assertOnlyKeys = (value: JsonObject, owner: string, allowed: readonly string[]) => {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${owner} 包含未知字段：${unknown.join("、")}`);
};

const stringArray = (value: unknown, owner: string) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${owner} 必须是字符串数组。`);
  }
  return value.map((item) => String(item));
};

const optionalBoolean = (value: unknown, owner: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${owner} 必须是布尔值。`);
  return value;
};

const optionalNumber = (value: unknown, owner: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${owner} 必须是有限数值。`);
  return value;
};

const optionalString = (value: unknown, owner: string) =>
  value === undefined ? undefined : nonEmptyString(value, owner);

const clone = <T>(value: T): T => structuredClone(value);
const keyFromPointer = (pointer: string) => (pointer.startsWith("/") ? pointer.slice(1) : pointer);
const FIELD_TYPES: readonly StoryFieldType[] = [
  "id",
  "text",
  "textarea",
  "content",
  "integer",
  "number",
  "boolean",
  "timestamp",
  "enum",
  "string-list",
  "reference",
  "reference-list",
  "object",
  "collection",
  "path",
];

const parseField = (input: unknown, owner: string): StoryFieldDefinition => {
  const value = objectValue(input, owner);
  assertOnlyKeys(value, owner, [
    "key",
    "type",
    "label",
    "description",
    "required",
    "readOnly",
    "immutable",
    "generated",
    "const",
    "default",
    "definition",
    "itemDefinition",
    "targetKinds",
    "targetObjectDefinitions",
    "options",
    "generatedFrom",
    "minimum",
    "maximum",
    "minLength",
    "minItems",
    "maxItems",
  ]);
  const key = nonEmptyString(value.key, `${owner}.key`);
  if (key.includes("/")) throw new Error(`${owner}.key 必须是直接属性名。`);
  const type = nonEmptyString(value.type, `${owner}.type`);
  if (!FIELD_TYPES.includes(type as StoryFieldType)) throw new Error(`${owner}.type 不受支持：${type}`);
  const options =
    value.options === undefined
      ? undefined
      : Array.isArray(value.options)
        ? value.options.map((option, index) => {
            const item = objectValue(option, `${owner}.options[${index}]`);
            return {
              value: nonEmptyString(item.value, `${owner}.options[${index}].value`),
              label: nonEmptyString(item.label, `${owner}.options[${index}].label`),
            };
          })
        : (() => {
            throw new Error(`${owner}.options 必须是数组。`);
          })();
  const description = optionalString(value.description, `${owner}.description`);
  const definition = optionalString(value.definition, `${owner}.definition`);
  const itemDefinition = optionalString(value.itemDefinition, `${owner}.itemDefinition`);
  const generatedFrom = optionalString(value.generatedFrom, `${owner}.generatedFrom`);
  const required = optionalBoolean(value.required, `${owner}.required`);
  const readOnly = optionalBoolean(value.readOnly, `${owner}.readOnly`);
  const immutable = optionalBoolean(value.immutable, `${owner}.immutable`);
  const generated = optionalBoolean(value.generated, `${owner}.generated`);
  const minimum = optionalNumber(value.minimum, `${owner}.minimum`);
  const maximum = optionalNumber(value.maximum, `${owner}.maximum`);
  const minLength = optionalNumber(value.minLength, `${owner}.minLength`);
  const minItems = optionalNumber(value.minItems, `${owner}.minItems`);
  const maxItems = optionalNumber(value.maxItems, `${owner}.maxItems`);
  return {
    key,
    type: type as StoryFieldType,
    label: nonEmptyString(value.label, `${owner}.label`),
    ...(description ? { description } : {}),
    ...(required === undefined ? {} : { required }),
    ...(readOnly === undefined ? {} : { readOnly }),
    ...(immutable === undefined ? {} : { immutable }),
    ...(generated === undefined ? {} : { generated }),
    ...(value.const === undefined ? {} : { const: clone(value.const) }),
    ...(value.default === undefined ? {} : { default: clone(value.default) }),
    ...(definition ? { definition } : {}),
    ...(itemDefinition ? { itemDefinition } : {}),
    ...(options ? { options } : {}),
    ...(value.targetKinds === undefined ? {} : { targetKinds: stringArray(value.targetKinds, `${owner}.targetKinds`) }),
    ...(value.targetObjectDefinitions === undefined
      ? {}
      : {
          targetObjectDefinitions: stringArray(value.targetObjectDefinitions, `${owner}.targetObjectDefinitions`),
        }),
    ...(generatedFrom ? { generatedFrom } : {}),
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(minItems === undefined ? {} : { minItems }),
    ...(maxItems === undefined ? {} : { maxItems }),
  } as StoryFieldDefinition;
};

const parseFields = (input: unknown, owner: string) => {
  if (!Array.isArray(input)) throw new Error(`${owner} 必须是字段数组。`);
  return defineFields(input.map((field, index) => parseField(field, `${owner}[${index}]`)));
};

const parseObjectDefinition = (input: unknown, owner: string): StoryObjectDefinition => {
  const value = objectValue(input, owner);
  assertOnlyKeys(value, owner, ["id", "label", "fields"]);
  return {
    id: nonEmptyString(value.id, `${owner}.id`),
    ...(typeof value.label === "string" && value.label.trim() ? { label: value.label.trim() } : {}),
    fields: parseFields(value.fields, `${owner}.fields`),
  };
};

const parseDocumentDisplay = (input: unknown, owner: string): StoryDocumentDisplayDefinition => {
  const value = objectValue(input, owner);
  assertOnlyKeys(value, owner, ["template", "sourceKind", "suffix"]);
  const sourceKind = optionalString(value.sourceKind, `${owner}.sourceKind`);
  const suffix = optionalString(value.suffix, `${owner}.suffix`);
  return {
    template: nonEmptyString(value.template, `${owner}.template`),
    ...(sourceKind ? { sourceKind } : {}),
    ...(suffix ? { suffix } : {}),
  };
};

const parseDocumentDefinition = (input: unknown, owner: string): StoryDocumentDefinition => {
  const value = objectValue(input, owner);
  assertOnlyKeys(value, owner, [
    "kind",
    "label",
    "description",
    "contentFormat",
    "cardinality",
    "identityFields",
    "fields",
    "display",
    "companionKinds",
    "ruleIds",
  ]);
  const contentFormat = value.contentFormat ?? "structured";
  if (contentFormat !== "structured" && contentFormat !== "markdown") {
    throw new Error(`${owner}.contentFormat 必须是 structured 或 markdown。`);
  }
  if (value.cardinality !== "one" && value.cardinality !== "many") {
    throw new Error(`${owner}.cardinality 必须是 one 或 many。`);
  }
  const identityFields =
    value.identityFields === undefined
      ? value.cardinality === "many"
        ? ["id"]
        : []
      : stringArray(value.identityFields, `${owner}.identityFields`);
  if (new Set(identityFields).size !== identityFields.length) {
    throw new Error(`${owner}.identityFields 不得重复。`);
  }
  if (
    (value.cardinality === "one" && identityFields.length > 0) ||
    (value.cardinality === "many" && identityFields.length === 0)
  ) {
    throw new Error(`${owner}.identityFields 必须与 cardinality 一致。`);
  }
  const fields = parseFields(value.fields, `${owner}.fields`);
  if (identityFields.some((key) => !fields.some((field) => field.key === key))) {
    throw new Error(`${owner}.identityFields 引用了未定义字段。`);
  }
  if (
    identityFields.some((key) => {
      const field = fields.find((candidate) => candidate.key === key);
      return !field?.required || !field.immutable;
    })
  ) {
    throw new Error(`${owner}.identityFields 必须引用 required 且 immutable 的字段。`);
  }
  return {
    kind: nonEmptyString(value.kind, `${owner}.kind`),
    label: nonEmptyString(value.label, `${owner}.label`),
    ...(typeof value.description === "string" && value.description.trim()
      ? { description: value.description.trim() }
      : {}),
    contentFormat,
    cardinality: value.cardinality,
    identityFields,
    fields,
    ...(value.display === undefined ? {} : { display: parseDocumentDisplay(value.display, `${owner}.display`) }),
    ...(value.companionKinds === undefined
      ? {}
      : { companionKinds: stringArray(value.companionKinds, `${owner}.companionKinds`) }),
    ...(value.ruleIds === undefined ? {} : { ruleIds: stringArray(value.ruleIds, `${owner}.ruleIds`) }),
  };
};

const parseContextDefinition = (input: unknown, owner: string): StoryContextDefinition => {
  const value = objectValue(input, owner);
  assertOnlyKeys(value, owner, ["name", "label", "scope", "targetKind", "targetSelectors", "documentKinds"]);
  if (value.scope !== "project" && value.scope !== "chapter") {
    throw new Error(`${owner}.scope 必须是 project 或 chapter。`);
  }
  return {
    name: nonEmptyString(value.name, `${owner}.name`),
    label: nonEmptyString(value.label, `${owner}.label`),
    scope: value.scope,
    ...(value.targetKind === undefined ? {} : { targetKind: nonEmptyString(value.targetKind, `${owner}.targetKind`) }),
    ...(value.targetSelectors === undefined
      ? {}
      : {
          targetSelectors: stringArray(value.targetSelectors, `${owner}.targetSelectors`).map(keyFromPointer),
        }),
    documentKinds: stringArray(value.documentKinds, `${owner}.documentKinds`),
  };
};

export const defineStoryType = (input: StoryTypeDefinition): StoryTypeDefinition => {
  const value = objectValue(clone(input), "故事类型定义");
  assertOnlyKeys(value, "故事类型定义", [
    "$format",
    "formatVersion",
    "id",
    "version",
    "label",
    "description",
    "manifestKind",
    "primaryKind",
    "roles",
    "objects",
    "documents",
    "contexts",
    "validationModes",
    "rules",
  ]);
  if (value.$format !== STORY_TYPE_DEFINITION_FORMAT || value.formatVersion !== STORY_TYPE_DEFINITION_FORMAT_VERSION) {
    throw new Error("故事类型定义格式无效。 ");
  }
  if (!Array.isArray(value.objects) || !Array.isArray(value.documents) || !Array.isArray(value.contexts)) {
    throw new Error("故事类型定义的 objects、documents 和 contexts 必须是数组。 ");
  }
  const objects = value.objects.map((item, index) => parseObjectDefinition(item, `objects[${index}]`));
  const documents = value.documents.map((item, index) => parseDocumentDefinition(item, `documents[${index}]`));
  const contexts = value.contexts.map((item, index) => parseContextDefinition(item, `contexts[${index}]`));
  if (documents.length === 0) throw new Error("故事类型至少需要一个文档定义。 ");
  const objectIds = objects.map((item) => item.id);
  const kinds = documents.map((item) => item.kind);
  const contextNames = contexts.map((item) => item.name);
  const validationModes = objectValue(
    value.validationModes,
    "validationModes",
  ) as StoryTypeDefinition["validationModes"];
  const rules = objectValue(value.rules, "rules") as StoryTypeDefinition["rules"];
  if (Object.keys(validationModes).length === 0) throw new Error("故事类型至少需要一个校验模式。 ");
  if (new Set(objectIds).size !== objectIds.length) throw new Error("故事对象定义 ID 不得重复。 ");
  if (new Set(kinds).size !== kinds.length) throw new Error("故事文档 kind 不得重复。 ");
  if (new Set(contextNames).size !== contextNames.length) throw new Error("故事上下文名称不得重复。 ");
  for (const document of documents) {
    for (const field of document.fields) {
      if (field.definition && !objectIds.includes(field.definition)) {
        throw new Error(`${document.kind}.${field.key} 引用了未知对象定义：${field.definition}`);
      }
      if (field.itemDefinition && !objectIds.includes(field.itemDefinition)) {
        throw new Error(`${document.kind}.${field.key} 引用了未知对象定义：${field.itemDefinition}`);
      }
      if (field.targetKinds?.some((kind) => !kinds.includes(kind))) {
        throw new Error(`${document.kind}.${field.key} 引用了未知目标文档。`);
      }
      if (field.targetObjectDefinitions?.some((id) => !objectIds.includes(id))) {
        throw new Error(`${document.kind}.${field.key} 引用了未知目标对象定义。`);
      }
    }
    for (const companionKind of document.companionKinds ?? []) {
      if (!kinds.includes(companionKind)) throw new Error(`${document.kind} 引用了未知配套文档：${companionKind}`);
    }
    if (document.display) {
      const source = document.display.sourceKind
        ? documents.find((candidate) => candidate.kind === document.display?.sourceKind)
        : document;
      if (!source) throw new Error(`${document.kind}.display 引用了未知来源文档：${document.display.sourceKind}`);
      if (document.display.sourceKind && !(document.companionKinds ?? []).includes(document.display.sourceKind)) {
        throw new Error(`${document.kind}.display.sourceKind 必须引用配套文档。`);
      }
      if (
        document.display.sourceKind &&
        (source.identityFields.length !== document.identityFields.length ||
          source.identityFields.some((field, index) => field !== document.identityFields[index]))
      ) {
        throw new Error(`${document.kind}.display.sourceKind 必须与当前文档使用相同身份字段。`);
      }
      const placeholders = [...document.display.template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!);
      const remainder = document.display.template.replace(/\{[^{}]+\}/g, "");
      if (remainder.includes("{") || remainder.includes("}")) {
        throw new Error(`${document.kind}.display.template 包含无效占位符。`);
      }
      const sourceFields = new Set(source.fields.map((field) => field.key));
      const unknownPlaceholders = placeholders.filter((field) => !sourceFields.has(field));
      if (unknownPlaceholders.length > 0) {
        throw new Error(
          `${document.kind}.display.template 引用了来源文档未定义的字段：${unknownPlaceholders.join("、")}`,
        );
      }
    }
    for (const ruleId of document.ruleIds ?? []) {
      if (!rules[ruleId]) throw new Error(`${document.kind} 引用了未知校验规则：${ruleId}`);
    }
  }
  for (const object of objects) {
    for (const field of object.fields) {
      if (field.definition && !objectIds.includes(field.definition)) {
        throw new Error(`${object.id}.${field.key} 引用了未知对象定义：${field.definition}`);
      }
      if (field.itemDefinition && !objectIds.includes(field.itemDefinition)) {
        throw new Error(`${object.id}.${field.key} 引用了未知对象定义：${field.itemDefinition}`);
      }
      if (field.targetKinds?.some((kind) => !kinds.includes(kind))) {
        throw new Error(`${object.id}.${field.key} 引用了未知目标文档。`);
      }
      if (field.targetObjectDefinitions?.some((id) => !objectIds.includes(id))) {
        throw new Error(`${object.id}.${field.key} 引用了未知目标对象定义。`);
      }
    }
  }
  const roles = objectValue(value.roles, "roles");
  for (const [role, kind] of Object.entries(roles)) {
    if (typeof kind !== "string" || !kinds.includes(kind))
      throw new Error(`roles.${role} 引用了未知文档：${String(kind)}`);
  }
  for (const context of contexts) {
    if (context.documentKinds.length === 0 || context.documentKinds.some((kind) => !kinds.includes(kind))) {
      throw new Error(`${context.name} 包含未知或空的上下文文档列表。`);
    }
    if (context.targetKind && !kinds.includes(context.targetKind)) {
      throw new Error(`${context.name} 引用了未知目标文档：${context.targetKind}`);
    }
  }
  const manifestKind = nonEmptyString(value.manifestKind, "manifestKind");
  const manifest = documents.find((document) => document.kind === manifestKind);
  if (!manifest || manifest.cardinality !== "one") throw new Error("manifestKind 必须指向单例文档。 ");
  const primaryKind = value.primaryKind === undefined ? undefined : nonEmptyString(value.primaryKind, "primaryKind");
  if (primaryKind && !kinds.includes(primaryKind)) throw new Error("primaryKind 引用了未知文档。 ");
  const definition: StoryTypeDefinition = {
    $format: STORY_TYPE_DEFINITION_FORMAT,
    formatVersion: STORY_TYPE_DEFINITION_FORMAT_VERSION,
    id: nonEmptyString(value.id, "id"),
    version: positiveInteger(value.version, "version"),
    label: nonEmptyString(value.label, "label"),
    description: nonEmptyString(value.description, "description"),
    manifestKind,
    ...(primaryKind ? { primaryKind } : {}),
    roles: Object.fromEntries(Object.entries(roles).map(([role, kind]) => [role, String(kind)])),
    objects,
    documents,
    contexts,
    validationModes,
    rules,
  };
  return Object.freeze(definition);
};

export const parseStoryTypeDefinition = (input: unknown) => defineStoryType(input as StoryTypeDefinition);
