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

export type StoryContractContextView = Readonly<{
  label: string;
  scope: "project" | "chapter";
  targetKind?: string;
  targetSelectors?: readonly string[];
  documentKinds: readonly string[];
  [key: string]: unknown;
}>;

export type StoryProjectContract = Readonly<{
  $format: "novel-claw.structured-document-contract";
  contractId: string;
  contractVersion: number;
  schemaVersion: number;
  rootPath: string;
  commonFieldSets: Readonly<Record<string, Readonly<Record<string, StoryContractField>>>>;
  objectDefinitions: Readonly<
    Record<string, Readonly<{ fields: Readonly<Record<string, StoryContractField>>; [key: string]: unknown }>>
  >;
  documents: Readonly<Record<string, StoryContractDocument>>;
  contextViews: Readonly<Record<string, StoryContractContextView>>;
  validationProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  [key: string]: unknown;
}>;

export type StructuredStoryDocument = Readonly<{
  $format: "novel-claw.structured-document";
  $formatVersion: 1;
  $contract: Readonly<{ id: string; version: number }>;
  $document: Readonly<{ kind: string; label: string; path: string }>;
  $schema: Readonly<{
    fields: Readonly<Record<string, StoryContractField>>;
    objectDefinitions: Readonly<Record<string, unknown>>;
  }>;
  data: Record<string, unknown>;
}>;

const objectFromUnknown = (value: unknown, owner: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} 必须是普通 JSON 对象。`);
  }
  return value as Record<string, unknown>;
};

const nonEmptyString = (value: unknown, owner: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${owner} 必须是非空字符串。`);
  return value;
};

const positiveInteger = (value: unknown, owner: string) => {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${owner} 必须是正整数。`);
  return Number(value);
};

export const parseStoryProjectContract = (input: unknown): StoryProjectContract => {
  const value = objectFromUnknown(input, "故事项目协议");
  if (value.$format !== "novel-claw.structured-document-contract") {
    throw new Error("故事项目协议 $format 无效。");
  }
  const documents = objectFromUnknown(value.documents, "故事项目协议 documents");
  if (Object.keys(documents).length === 0) throw new Error("故事项目协议至少需要定义一种文档。");
  for (const [kind, documentInput] of Object.entries(documents)) {
    const document = objectFromUnknown(documentInput, `故事项目协议 documents.${kind}`);
    nonEmptyString(document.label, `documents.${kind}.label`);
    nonEmptyString(document.pathPattern, `documents.${kind}.pathPattern`);
    if (document.cardinality !== "one" && document.cardinality !== "many") {
      throw new Error(`documents.${kind}.cardinality 必须是 one 或 many。`);
    }
    objectFromUnknown(document.fields, `documents.${kind}.fields`);
  }
  const contextViews = objectFromUnknown(value.contextViews, "故事项目协议 contextViews");
  for (const [name, viewInput] of Object.entries(contextViews)) {
    const view = objectFromUnknown(viewInput, `故事项目协议 contextViews.${name}`);
    nonEmptyString(view.label, `contextViews.${name}.label`);
    if (!Array.isArray(view.documentKinds) || view.documentKinds.length === 0) {
      throw new Error(`contextViews.${name}.documentKinds 必须是非空数组。`);
    }
    if (view.scope !== "project" && view.scope !== "chapter") {
      throw new Error(`contextViews.${name}.scope 必须是 project 或 chapter。`);
    }
    for (const kind of view.documentKinds) {
      if (typeof kind !== "string" || !documents[kind]) {
        throw new Error(`contextViews.${name} 引用了未知文档类型：${String(kind)}`);
      }
    }
    if (view.targetKind !== undefined && (typeof view.targetKind !== "string" || !documents[view.targetKind])) {
      throw new Error(`contextViews.${name}.targetKind 引用了未知文档类型。`);
    }
  }
  const contract = {
    ...value,
    $format: "novel-claw.structured-document-contract" as const,
    contractId: nonEmptyString(value.contractId, "contractId"),
    contractVersion: positiveInteger(value.contractVersion, "contractVersion"),
    schemaVersion: positiveInteger(value.schemaVersion, "schemaVersion"),
    rootPath: nonEmptyString(value.rootPath, "rootPath"),
    commonFieldSets: objectFromUnknown(value.commonFieldSets, "commonFieldSets"),
    objectDefinitions: objectFromUnknown(value.objectDefinitions, "objectDefinitions"),
    documents,
    contextViews,
    validationProfiles: objectFromUnknown(value.validationProfiles, "validationProfiles"),
  };
  return contract as unknown as StoryProjectContract;
};

export const storyContractContextViewForScope = (
  contract: StoryProjectContract,
  scope: StoryContractContextView["scope"],
) => {
  const entry = Object.entries(contract.contextViews).find(([, view]) => view.scope === scope);
  if (!entry) throw new Error(`工作区故事协议缺少 context view：${scope}`);
  return { name: entry[0], ...entry[1] };
};

const fieldName = (pointer: string) => {
  if (!/^\/[^/]+$/.test(pointer)) throw new Error(`协议当前只允许顶层字段 JSON Pointer：${pointer}`);
  return pointer.slice(1);
};

export const storyContractDocument = (contract: StoryProjectContract, kind: string) => {
  const document = contract.documents[kind];
  if (!document) throw new Error(`工作区协议未定义故事文档类型：${kind}`);
  return document;
};

export const storyContractDocumentFields = (contract: StoryProjectContract, kind: string) => {
  const document = storyContractDocument(contract, kind);
  const inherited = Object.assign(
    {},
    ...(document.fieldSets ?? []).map((name) => {
      const fieldSet = contract.commonFieldSets[name];
      if (!fieldSet) throw new Error(`工作区协议引用了未知字段集：${name}`);
      return fieldSet;
    }),
  ) as Record<string, StoryContractField>;
  const fields = { ...inherited, ...document.fields };
  for (const [pointer, value] of Object.entries(document.constFields ?? {})) {
    const field = fields[pointer];
    if (!field) throw new Error(`工作区协议的 constFields 未声明字段：${pointer}`);
    fields[pointer] = { ...field, const: value };
  }
  return fields;
};

const canonicalPath = (input: string) => {
  const path = input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`非法故事文件路径：${input}`);
  }
  return path;
};

const patternRegex = (pattern: string) => {
  const escaped = canonicalPath(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[^}]+\\\}/g, "[A-Za-z0-9_-]+")}$`);
};

export const storyContractKindForPath = (contract: StoryProjectContract, input: string) => {
  const path = canonicalPath(input);
  for (const [kind, document] of Object.entries(contract.documents)) {
    if (patternRegex(document.pathPattern).test(path)) return kind;
  }
  throw new Error(`工作区协议不允许故事文件路径：${path}`);
};

export const resolveStoryContractPath = (
  contract: StoryProjectContract,
  kind: string,
  parameters: Readonly<Record<string, string>> = {},
) => {
  const pattern = storyContractDocument(contract, kind).pathPattern;
  const path = pattern.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = parameters[name]?.trim();
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${kind} 路径缺少合法参数：${name}`);
    return value;
  });
  if (path.includes("{")) throw new Error(`${kind} 路径仍包含未解析参数：${path}`);
  return canonicalPath(path);
};

const cloneJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

const assertPrimitiveType = (field: StoryContractField, value: unknown, owner: string) => {
  const type = field.type;
  const stringTypes = new Set(["id", "text", "textarea", "content", "enum", "reference", "path"]);
  if (stringTypes.has(type) && typeof value !== "string") throw new Error(`${owner} 必须是字符串。`);
  if ((type === "integer" || type === "timestamp") && !Number.isInteger(value))
    throw new Error(`${owner} 必须是整数。`);
  if (type === "number" && typeof value !== "number") throw new Error(`${owner} 必须是数值。`);
  if (type === "boolean" && typeof value !== "boolean") throw new Error(`${owner} 必须是布尔值。`);
  if (
    (type === "string-list" || type === "reference-list") &&
    (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
  ) {
    throw new Error(`${owner} 必须是字符串数组。`);
  }
  if (field.options && !field.options.some((option) => option.value === value)) {
    throw new Error(`${owner} 不在协议允许的枚举值中。`);
  }
};

const materializeFields = (
  contract: StoryProjectContract,
  owner: string,
  fields: Readonly<Record<string, StoryContractField>>,
  input: unknown,
  timestamp: number,
) => {
  const source = objectFromUnknown(input, owner);
  const allowed = new Set(Object.keys(fields).map(fieldName));
  const unknownKeys = Object.keys(source).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) throw new Error(`${owner} 包含协议未声明的字段：${unknownKeys.join(", ")}`);
  const result: Record<string, unknown> = {};
  for (const [pointer, field] of Object.entries(fields)) {
    const key = fieldName(pointer);
    let value = source[key];
    if (field.const !== undefined) value = field.const;
    else if (field.generated && (key === "updatedAt" || key === "createdAt")) value = timestamp;
    else if (value === undefined && field.default !== undefined) value = cloneJson(field.default);
    if (value === undefined) {
      if (field.required) throw new Error(`${owner}.${key} 是协议声明的必填字段。`);
      continue;
    }
    if (field.definition) {
      const definition = contract.objectDefinitions[field.definition];
      if (!definition) throw new Error(`工作区协议缺少对象定义：${field.definition}`);
      value = materializeFields(contract, `${owner}.${key}`, definition.fields, value, timestamp);
    } else if (field.itemDefinition) {
      if (!Array.isArray(value)) throw new Error(`${owner}.${key} 必须是数组。`);
      const definition = contract.objectDefinitions[field.itemDefinition];
      if (!definition) throw new Error(`工作区协议缺少对象定义：${field.itemDefinition}`);
      value = value.map((item, index) =>
        materializeFields(contract, `${owner}.${key}[${index}]`, definition.fields, item, timestamp),
      );
    } else {
      assertPrimitiveType(field, value, `${owner}.${key}`);
    }
    result[key] = value;
  }
  return result;
};

export const materializeStoryDocument = (
  contract: StoryProjectContract,
  input: unknown,
  expectedKind: string,
  timestamp = Date.now(),
) => {
  const value = materializeFields(
    contract,
    expectedKind,
    storyContractDocumentFields(contract, expectedKind),
    input,
    timestamp,
  );
  if (value.kind !== expectedKind) {
    throw new Error(`故事文档 kind 与目标路径不一致：期望 ${expectedKind}，收到 ${String(value.kind)}`);
  }
  return value;
};

const collectDefinitions = (
  contract: StoryProjectContract,
  fields: Readonly<Record<string, StoryContractField>>,
  result: Record<string, unknown> = {},
) => {
  for (const field of Object.values(fields)) {
    for (const name of [field.definition, field.itemDefinition]) {
      if (!name || result[name]) continue;
      const definition = contract.objectDefinitions[name];
      if (!definition) throw new Error(`工作区协议缺少对象定义：${name}`);
      result[name] = definition;
      collectDefinitions(contract, definition.fields, result);
    }
  }
  return result;
};

export const encodeStructuredStoryDocument = (
  contract: StoryProjectContract,
  input: unknown,
  path: string,
): StructuredStoryDocument => {
  const kind = storyContractKindForPath(contract, path);
  const value = materializeStoryDocument(contract, input, kind);
  const document = storyContractDocument(contract, kind);
  const fields = storyContractDocumentFields(contract, kind);
  return {
    $format: "novel-claw.structured-document",
    $formatVersion: 1,
    $contract: { id: contract.contractId, version: contract.contractVersion },
    $document: { kind, label: document.label, path: canonicalPath(path) },
    $schema: { fields, objectDefinitions: collectDefinitions(contract, fields) },
    data: value,
  };
};

export const decodeStructuredStoryDocument = (contract: StoryProjectContract, input: unknown, path: string) => {
  const envelope = objectFromUnknown(input, path);
  const contractIdentity = objectFromUnknown(envelope.$contract, `${path}.$contract`);
  const documentIdentity = objectFromUnknown(envelope.$document, `${path}.$document`);
  if (
    envelope.$format !== "novel-claw.structured-document" ||
    envelope.$formatVersion !== 1 ||
    contractIdentity.id !== contract.contractId ||
    contractIdentity.version !== contract.contractVersion
  ) {
    throw new Error(`${path} 不是当前工作区协议编码的结构化文档。`);
  }
  const kind = storyContractKindForPath(contract, path);
  if (documentIdentity.kind !== kind || documentIdentity.path !== canonicalPath(path)) {
    throw new Error(`${path} 的结构化文档身份与实际路径不一致。`);
  }
  return materializeStoryDocument(contract, envelope.data, kind);
};

export const stringifyStoryProjectContract = (contract: StoryProjectContract) =>
  `${JSON.stringify(contract, null, 2)}\n`;
