export type StoryProfileField = Readonly<{
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

export type StoryProfileDocument = Readonly<{
  label: string;
  description?: string;
  contentType?: "json" | "markdown";
  pathPattern: string;
  cardinality: "one" | "many";
  fields: Readonly<Record<string, StoryProfileField>>;
  fieldSets?: readonly string[];
  constFields?: Readonly<Record<string, unknown>>;
  companionKinds?: readonly string[];
  ruleIds?: readonly string[];
  [key: string]: unknown;
}>;

export type StoryProfileContextView = Readonly<{
  label: string;
  scope: "project" | "chapter";
  targetKind?: string;
  targetSelectors?: readonly string[];
  documentKinds: readonly string[];
  [key: string]: unknown;
}>;

export type StoryProfile = Readonly<{
  $format: "novel-claw.story-profile";
  profileId: string;
  profileVersion: number;
  schemaVersion: number;
  rootPath: string;
  manifestKind: string;
  primaryKind?: string;
  commonFieldSets: Readonly<Record<string, Readonly<Record<string, StoryProfileField>>>>;
  objectDefinitions: Readonly<
    Record<string, Readonly<{ fields: Readonly<Record<string, StoryProfileField>>; [key: string]: unknown }>>
  >;
  documents: Readonly<Record<string, StoryProfileDocument>>;
  contextViews: Readonly<Record<string, StoryProfileContextView>>;
  validationProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  [key: string]: unknown;
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

export const parseStoryProfile = (input: unknown): StoryProfile => {
  const value = objectFromUnknown(input, "故事 Profile");
  if (value.$format !== "novel-claw.story-profile") {
    throw new Error("故事 Profile $format 无效。");
  }
  const documents = objectFromUnknown(value.documents, "故事 Profile documents");
  if (Object.keys(documents).length === 0) throw new Error("故事 Profile 至少需要定义一种文档。");
  for (const [kind, documentInput] of Object.entries(documents)) {
    const document = objectFromUnknown(documentInput, `故事 Profile documents.${kind}`);
    nonEmptyString(document.label, `documents.${kind}.label`);
    nonEmptyString(document.pathPattern, `documents.${kind}.pathPattern`);
    if (document.contentType !== undefined && document.contentType !== "json" && document.contentType !== "markdown") {
      throw new Error(`documents.${kind}.contentType 必须是 json 或 markdown。`);
    }
    if (document.cardinality !== "one" && document.cardinality !== "many") {
      throw new Error(`documents.${kind}.cardinality 必须是 one 或 many。`);
    }
    objectFromUnknown(document.fields, `documents.${kind}.fields`);
    if (
      document.companionKinds !== undefined &&
      (!Array.isArray(document.companionKinds) ||
        document.companionKinds.some((item) => typeof item !== "string" || !item.trim()))
    ) {
      throw new Error(`documents.${kind}.companionKinds 必须是字符串数组。`);
    }
  }
  const contextViews = objectFromUnknown(value.contextViews, "故事 Profile contextViews");
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
    $format: "novel-claw.story-profile" as const,
    profileId: nonEmptyString(value.profileId, "profileId"),
    profileVersion: positiveInteger(value.profileVersion, "profileVersion"),
    schemaVersion: positiveInteger(value.schemaVersion, "schemaVersion"),
    rootPath: nonEmptyString(value.rootPath, "rootPath"),
    manifestKind: nonEmptyString(value.manifestKind, "manifestKind"),
    ...(value.primaryKind === undefined ? {} : { primaryKind: nonEmptyString(value.primaryKind, "primaryKind") }),
    commonFieldSets: objectFromUnknown(value.commonFieldSets, "commonFieldSets"),
    objectDefinitions: objectFromUnknown(value.objectDefinitions, "objectDefinitions"),
    documents,
    contextViews,
    validationProfiles: objectFromUnknown(value.validationProfiles, "validationProfiles"),
  };
  if (!documents[contract.manifestKind] || (documents[contract.manifestKind] as StoryProfileDocument).cardinality !== "one") {
    throw new Error("manifestKind 必须指向 cardinality=one 的文档类型。");
  }
  if (contract.primaryKind && !documents[contract.primaryKind]) {
    throw new Error("primaryKind 指向了未知文档类型。");
  }
  return contract as unknown as StoryProfile;
};

export const storyProfileContextViewForScope = (contract: StoryProfile, scope: StoryProfileContextView["scope"]) => {
  const entry = Object.entries(contract.contextViews).find(([, view]) => view.scope === scope);
  if (!entry) throw new Error(`工作区故事协议缺少 context view：${scope}`);
  return { name: entry[0], ...entry[1] };
};

const fieldName = (pointer: string) => {
  if (!/^\/[^/]+$/.test(pointer)) throw new Error(`协议当前只允许顶层字段 JSON Pointer：${pointer}`);
  return pointer.slice(1);
};

export const storyProfileDocument = (contract: StoryProfile, kind: string) => {
  const document = contract.documents[kind];
  if (!document) throw new Error(`工作区协议未定义故事文档类型：${kind}`);
  return document;
};

export const storyProfileDocumentFields = (contract: StoryProfile, kind: string) => {
  const document = storyProfileDocument(contract, kind);
  const inherited = Object.assign(
    {},
    ...(document.fieldSets ?? []).map((name) => {
      const fieldSet = contract.commonFieldSets[name];
      if (!fieldSet) throw new Error(`工作区协议引用了未知字段集：${name}`);
      return fieldSet;
    }),
  ) as Record<string, StoryProfileField>;
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

const pathParameters = (pattern: string, input: string) => {
  const names = [...canonicalPath(pattern).matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const escaped = canonicalPath(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped.replace(/\\\{[^}]+\\\}/g, "([A-Za-z0-9_-]+)")}$`).exec(canonicalPath(input));
  if (!match) throw new Error(`文件路径不匹配文档模式：${input}`);
  return Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
};

export const storyProfileKindForPath = (contract: StoryProfile, input: string) => {
  const path = canonicalPath(input);
  for (const [kind, document] of Object.entries(contract.documents)) {
    if (patternRegex(document.pathPattern).test(path)) return kind;
  }
  throw new Error(`工作区协议不允许故事文件路径：${path}`);
};

export const resolveStoryProfilePath = (
  contract: StoryProfile,
  kind: string,
  parameters: Readonly<Record<string, string>> = {},
) => {
  const pattern = storyProfileDocument(contract, kind).pathPattern;
  const path = pattern.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = parameters[name]?.trim();
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${kind} 路径缺少合法参数：${name}`);
    return value;
  });
  if (path.includes("{")) throw new Error(`${kind} 路径仍包含未解析参数：${path}`);
  return canonicalPath(path);
};

const cloneJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

const assertPrimitiveType = (field: StoryProfileField, value: unknown, owner: string) => {
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
  if (typeof value === "number" && typeof field.minimum === "number" && value < field.minimum) {
    throw new Error(`${owner} 不能小于 ${field.minimum}。`);
  }
  if (typeof value === "number" && typeof field.maximum === "number" && value > field.maximum) {
    throw new Error(`${owner} 不能大于 ${field.maximum}。`);
  }
  if (typeof value === "string" && typeof field.minLength === "number" && value.length < field.minLength) {
    throw new Error(`${owner} 长度不能小于 ${field.minLength}。`);
  }
  if (Array.isArray(value) && typeof field.minItems === "number" && value.length < field.minItems) {
    throw new Error(`${owner} 至少需要 ${field.minItems} 项。`);
  }
  if (Array.isArray(value) && typeof field.maxItems === "number" && value.length > field.maxItems) {
    throw new Error(`${owner} 不能超过 ${field.maxItems} 项。`);
  }
};

const materializeFields = (
  contract: StoryProfile,
  owner: string,
  fields: Readonly<Record<string, StoryProfileField>>,
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
  contract: StoryProfile,
  input: unknown,
  expectedKind: string,
  timestamp = Date.now(),
) => {
  const value = materializeFields(
    contract,
    expectedKind,
    storyProfileDocumentFields(contract, expectedKind),
    input,
    timestamp,
  );
  if (value.kind !== expectedKind) {
    throw new Error(`故事文档 kind 与目标路径不一致：期望 ${expectedKind}，收到 ${String(value.kind)}`);
  }
  return value;
};

export const serializeStoryDocument = (
  contract: StoryProfile,
  input: unknown,
  path: string,
): Record<string, unknown> | string => {
  const kind = storyProfileKindForPath(contract, path);
  const document = storyProfileDocument(contract, kind);
  if (document.contentType === "markdown") return parseStoryDocument(contract, input, path).content as string;
  const source = objectFromUnknown(input, path);
  const allowed = new Set(Object.keys(storyProfileDocumentFields(contract, kind)).map(fieldName));
  return materializeStoryDocument(
    contract,
    Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key))),
    kind,
  );
};

export const parseStoryDocument = (contract: StoryProfile, input: unknown, path: string, timestamp = Date.now()) => {
  const kind = storyProfileKindForPath(contract, path);
  const document = storyProfileDocument(contract, kind);
  if (document.contentType === "markdown") {
    const content = typeof input === "string" ? input : objectFromUnknown(input, path).content;
    if (typeof content !== "string") throw new Error(`${path} 的 Markdown 内容必须是字符串。`);
    const parameters = pathParameters(document.pathPattern, path);
    const id = parameters.id;
    if (!id) throw new Error(`${kind} 的 Markdown 路径必须包含 {id} 参数。`);
    return { kind, id, content };
  }
  return materializeStoryDocument(contract, input, kind, timestamp);
};

export const stringifyStoryProfile = (contract: StoryProfile) => `${JSON.stringify(contract, null, 2)}\n`;
