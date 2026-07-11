import contractJson from "../contract.json" with { type: "json" };
import { storyProjectFileSchemasByKind, type StoryProjectFile } from "./schema.js";

export type StoryContractField = Readonly<{
  type: string;
  label: string;
  description?: string;
  required?: boolean;
  readOnly?: boolean;
  immutable?: boolean;
  generated?: boolean;
  const?: unknown;
  default?: unknown;
  definition?: string;
  itemDefinition?: string;
  targetKinds?: readonly string[];
  targetObjectDefinitions?: readonly string[];
  options?: readonly Readonly<{ value: string; label: string }>[];
  [key: string]: unknown;
}>;

export type StoryContractDocument = Readonly<{
  label: string;
  description?: string;
  pathPattern: string;
  cardinality: "one" | "many";
  fields: Readonly<Record<string, StoryContractField>>;
  fieldSets?: readonly string[];
  constFields?: Readonly<Record<string, unknown>>;
  ruleIds?: readonly string[];
  [key: string]: unknown;
}>;

export type StoryAuthoringContract = Readonly<{
  $format: "novel-claw.structured-document-contract";
  contractId: "novel-claw.story-authoring";
  contractVersion: 1;
  capability: "novel-claw.structured-story@1";
  schemaVersion: 1;
  rootPath: "story";
  skillBindings: Readonly<
    Record<
      string,
      Readonly<{
        role: string;
        documentKinds: readonly string[];
        validationProfiles: readonly string[];
      }>
    >
  >;
  commonFieldSets: Readonly<Record<string, Readonly<Record<string, StoryContractField>>>>;
  objectDefinitions: Readonly<
    Record<string, Readonly<{ fields: Readonly<Record<string, StoryContractField>>; [key: string]: unknown }>>
  >;
  documents: Readonly<Record<string, StoryContractDocument>>;
  validationProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  [key: string]: unknown;
}>;

const assertContract = (value: typeof contractJson): StoryAuthoringContract => {
  if (
    value.$format !== "novel-claw.structured-document-contract" ||
    value.contractId !== "novel-claw.story-authoring" ||
    value.contractVersion !== 1 ||
    value.capability !== "novel-claw.structured-story@1" ||
    value.schemaVersion !== 1 ||
    value.rootPath !== "story"
  ) {
    throw new Error("story-authoring contract.json 的身份或版本无效。");
  }
  const manifest = value.documents["story-manifest"];
  if (!manifest || manifest.pathPattern !== "story/manifest.json") {
    throw new Error("story-authoring contract.json 缺少合法的 manifest 定义。");
  }
  return value as StoryAuthoringContract;
};

export const STORY_AUTHORING_CONTRACT = assertContract(contractJson);
export const STORY_AUTHORING_MANIFEST_PATH = STORY_AUTHORING_CONTRACT.documents["story-manifest"].pathPattern;

export const storyContractDocument = (kind: string) => {
  const document = STORY_AUTHORING_CONTRACT.documents[kind];
  if (!document) {
    throw new Error(`contract.json 未定义故事文档类型：${kind}`);
  }
  return document;
};

const fieldName = (pointer: string) => {
  if (!/^\/[^/]+$/.test(pointer)) {
    throw new Error(`contract.json 当前只允许顶层字段 JSON Pointer：${pointer}`);
  }
  return pointer.slice(1);
};

const documentFields = (document: StoryContractDocument) => {
  const inherited = Object.assign(
    {},
    ...(document.fieldSets ?? []).map((name) => {
      const fieldSet = STORY_AUTHORING_CONTRACT.commonFieldSets[name];
      if (!fieldSet) throw new Error(`contract.json 引用了未知字段集：${name}`);
      return fieldSet;
    }),
  ) as Record<string, StoryContractField>;
  const fields = { ...inherited, ...document.fields };
  for (const [pointer, value] of Object.entries(document.constFields ?? {})) {
    const field = fields[pointer];
    if (!field) throw new Error(`contract.json 的 constFields 未声明字段：${pointer}`);
    fields[pointer] = { ...field, const: value };
  }
  return fields;
};

const assertContractMatchesSchemas = () => {
  for (const [kind, schema] of Object.entries(storyProjectFileSchemasByKind)) {
    const document = storyContractDocument(kind);
    const contractKeys = Object.keys(documentFields(document)).map(fieldName).sort();
    const schemaKeys = Object.keys(schema.shape).sort();
    if (JSON.stringify(contractKeys) !== JSON.stringify(schemaKeys)) {
      throw new Error(
        `contract.json 与 ${kind} Schema 字段不一致：contract=${contractKeys.join(",")} schema=${schemaKeys.join(",")}`,
      );
    }
  }
};

assertContractMatchesSchemas();

const objectFromUnknown = (value: unknown, owner: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} 必须是普通 JSON 对象。`);
  }
  return value as Record<string, unknown>;
};

const cloneJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

const materializeFields = (
  owner: string,
  fields: Readonly<Record<string, StoryContractField>>,
  input: unknown,
  timestamp: number,
) => {
  const source = objectFromUnknown(input, owner);
  const allowed = new Set(Object.keys(fields).map(fieldName));
  const unknownKeys = Object.keys(source).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${owner} 包含 contract.json 未声明的字段：${unknownKeys.join(", ")}`);
  }
  const result: Record<string, unknown> = {};
  for (const [pointer, field] of Object.entries(fields)) {
    const key = fieldName(pointer);
    let value = source[key];
    if (field.const !== undefined) {
      value = field.const;
    } else if (field.generated && (key === "updatedAt" || key === "createdAt")) {
      value = timestamp;
    } else if (value === undefined && field.default !== undefined) {
      value = cloneJson(field.default);
    }
    if (value === undefined) {
      if (field.required) throw new Error(`${owner}.${key} 是 contract.json 声明的必填字段。`);
      continue;
    }
    if (field.definition) {
      const definition = STORY_AUTHORING_CONTRACT.objectDefinitions[field.definition];
      if (!definition) throw new Error(`contract.json 缺少对象定义：${field.definition}`);
      value = materializeFields(`${owner}.${key}`, definition.fields, value, timestamp);
    }
    if (field.itemDefinition) {
      if (!Array.isArray(value)) throw new Error(`${owner}.${key} 必须是数组。`);
      const definition = STORY_AUTHORING_CONTRACT.objectDefinitions[field.itemDefinition];
      if (!definition) throw new Error(`contract.json 缺少对象定义：${field.itemDefinition}`);
      value = value.map((item, index) =>
        materializeFields(`${owner}.${key}[${index}]`, definition.fields, item, timestamp),
      );
    }
    result[key] = value;
  }
  return result;
};

export const storyContractKindForPath = (path: string) => {
  for (const [kind, document] of Object.entries(STORY_AUTHORING_CONTRACT.documents)) {
    const pattern = document.pathPattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{[^}]+\\\}/g, "[A-Za-z0-9_-]+");
    if (new RegExp(`^${pattern}$`).test(path)) return kind;
  }
  throw new Error(`contract.json 不允许故事文件路径：${path}`);
};

export const materializeStoryDocument = (input: unknown, expectedKind: string, timestamp = Date.now()) => {
  const document = storyContractDocument(expectedKind);
  const value = materializeFields(expectedKind, documentFields(document), input, timestamp);
  if (value.kind !== expectedKind) {
    throw new Error(`故事文档 kind 与目标路径不一致：期望 ${expectedKind}，收到 ${String(value.kind)}`);
  }
  return value;
};

const collectDefinitions = (
  fields: Readonly<Record<string, StoryContractField>>,
  result: Record<string, unknown> = {},
) => {
  for (const field of Object.values(fields)) {
    for (const name of [field.definition, field.itemDefinition]) {
      if (!name || result[name]) continue;
      const definition = STORY_AUTHORING_CONTRACT.objectDefinitions[name];
      if (!definition) throw new Error(`contract.json 缺少对象定义：${name}`);
      result[name] = definition;
      collectDefinitions(definition.fields, result);
    }
  }
  return result;
};

export type StructuredStoryDocument = Readonly<{
  $format: "novel-claw.structured-document";
  $formatVersion: 1;
  $contract: Readonly<{ id: "novel-claw.story-authoring"; version: 1 }>;
  $document: Readonly<{ kind: string; label: string; path: string }>;
  $schema: Readonly<{
    fields: Readonly<Record<string, StoryContractField>>;
    objectDefinitions: Readonly<Record<string, unknown>>;
  }>;
  data: StoryProjectFile;
}>;

export const encodeStoryDocument = (value: StoryProjectFile, path: string): StructuredStoryDocument => {
  const expectedKind = storyContractKindForPath(path);
  if (value.kind !== expectedKind) {
    throw new Error(`故事文档 kind 与目标路径不一致：期望 ${expectedKind}，收到 ${value.kind}`);
  }
  const document = storyContractDocument(value.kind);
  const fields = documentFields(document);
  return {
    $format: "novel-claw.structured-document",
    $formatVersion: 1,
    $contract: {
      id: STORY_AUTHORING_CONTRACT.contractId,
      version: STORY_AUTHORING_CONTRACT.contractVersion,
    },
    $document: { kind: value.kind, label: document.label, path },
    $schema: {
      fields,
      objectDefinitions: collectDefinitions(fields),
    },
    data: value,
  };
};

export const decodeStoryDocument = (input: unknown, path: string): StoryProjectFile => {
  const envelope = objectFromUnknown(input, path);
  const contract = objectFromUnknown(envelope.$contract, `${path}.$contract`);
  const document = objectFromUnknown(envelope.$document, `${path}.$document`);
  if (
    envelope.$format !== "novel-claw.structured-document" ||
    envelope.$formatVersion !== 1 ||
    contract.id !== STORY_AUTHORING_CONTRACT.contractId ||
    contract.version !== STORY_AUTHORING_CONTRACT.contractVersion
  ) {
    throw new Error(`${path} 不是当前 story-authoring contract 编码的结构化文档。`);
  }
  const expectedKind = storyContractKindForPath(path);
  if (document.kind !== expectedKind || document.path !== path) {
    throw new Error(`${path} 的结构化文档身份与实际路径不一致。`);
  }
  const data = objectFromUnknown(envelope.data, `${path}.data`);
  if (data.kind !== expectedKind) {
    throw new Error(`${path}.data.kind 与 contract 文档类型不一致。`);
  }
  return data as StoryProjectFile;
};
