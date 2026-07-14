import { defineStoryProjectLayout, type StoryProjectLayout, type StoryProjectLayoutInput } from "./layout.js";
import { STORY_PROJECT_IDENTIFIERS } from "../identifiers.js";

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

export type StoryProfileDocumentSource = Readonly<{
  label: string;
  description?: string;
  contentType?: "json" | "markdown";
  layoutPresence: "required" | "optional";
  cardinality: "one" | "many";
  fields: Readonly<Record<string, StoryProfileField>>;
  fieldSets?: readonly string[];
  constFields?: Readonly<Record<string, unknown>>;
  companionKinds?: readonly string[];
  ruleIds?: readonly string[];
  [key: string]: unknown;
}>;

export type StoryProfileDocument = StoryProfileDocumentSource & Readonly<{ pathPattern: string }>;

export type StoryProfileContextView = Readonly<{
  label: string;
  scope: "project" | "chapter";
  targetKind?: string;
  targetSelectors?: readonly string[];
  documentKinds: readonly string[];
  [key: string]: unknown;
}>;

export type StoryProfileSource = Readonly<{
  $format: (typeof STORY_PROJECT_IDENTIFIERS.declarativeProfile)["format"];
  profileId: string;
  profileVersion: number;
  schemaVersion: number;
  manifestKind: string;
  primaryKind?: string;
  documentRoles: Readonly<Record<string, string>>;
  commonFieldSets: Readonly<Record<string, Readonly<Record<string, StoryProfileField>>>>;
  objectDefinitions: Readonly<
    Record<string, Readonly<{ fields: Readonly<Record<string, StoryProfileField>>; [key: string]: unknown }>>
  >;
  documents: Readonly<Record<string, StoryProfileDocumentSource>>;
  contextViews: Readonly<Record<string, StoryProfileContextView>>;
  validationProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  [key: string]: unknown;
}>;

export type StoryProfile = StoryProfileSource &
  Readonly<{
    rootPath: string;
    documents: Readonly<Record<string, StoryProfileDocument>>;
  }>;

export type DefinedStoryProfile<TDocumentKind extends string, TOptionalKind extends TDocumentKind> = Readonly<{
  identity: Readonly<{ id: string; version: number }>;
  source: StoryProfileSource;
  documentKinds: readonly TDocumentKind[];
  requiredDocumentKinds: readonly Exclude<TDocumentKind, TOptionalKind>[];
  optionalDocumentKinds: readonly TOptionalKind[];
  defineLayout(
    input: StoryProjectLayoutInput<Exclude<TDocumentKind, TOptionalKind>, TOptionalKind>,
  ): StoryProjectLayout;
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

export const parseStoryProfile = (input: unknown): StoryProfileSource => {
  const value = objectFromUnknown(input, "故事 Profile");
  if (value.$format !== STORY_PROJECT_IDENTIFIERS.declarativeProfile.format) {
    throw new Error("故事 Profile $format 无效。");
  }
  if (value.rootPath !== undefined) {
    throw new Error("故事 Profile 不得声明 rootPath；实际根目录必须由 Layout 决定。");
  }
  const documents = objectFromUnknown(value.documents, "故事 Profile documents");
  if (Object.keys(documents).length === 0) throw new Error("故事 Profile 至少需要定义一种文档。");
  for (const [kind, documentInput] of Object.entries(documents)) {
    const document = objectFromUnknown(documentInput, `故事 Profile documents.${kind}`);
    nonEmptyString(document.label, `documents.${kind}.label`);
    if (document.pathPattern !== undefined) {
      throw new Error(`documents.${kind} 不得声明 pathPattern；实际文件路径必须由 Layout 决定。`);
    }
    if (document.layoutPresence !== "required" && document.layoutPresence !== "optional") {
      throw new Error(`documents.${kind}.layoutPresence 必须是 required 或 optional。`);
    }
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
  const rawDocumentRoles = objectFromUnknown(value.documentRoles, "故事 Profile documentRoles");
  if (Object.keys(rawDocumentRoles).length === 0) throw new Error("故事 Profile 至少需要定义一种文档角色。");
  const documentRoles = Object.fromEntries(
    Object.entries(rawDocumentRoles).map(([role, inputKind]) => {
      const normalizedRole = nonEmptyString(role, "documentRoles 角色名");
      const kind = nonEmptyString(inputKind, `documentRoles.${role}`);
      if (!documents[kind]) throw new Error(`documentRoles.${role} 引用了未知文档类型：${kind}`);
      return [normalizedRole, kind];
    }),
  );
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
  const schemaVersion = positiveInteger(value.schemaVersion, "schemaVersion");
  if (schemaVersion !== STORY_PROJECT_IDENTIFIERS.declarativeProfile.schemaVersion) {
    throw new Error(`故事 Profile schemaVersion 暂不支持：${schemaVersion}`);
  }
  const contract = {
    ...value,
    $format: STORY_PROJECT_IDENTIFIERS.declarativeProfile.format,
    profileId: nonEmptyString(value.profileId, "profileId"),
    profileVersion: positiveInteger(value.profileVersion, "profileVersion"),
    schemaVersion,
    manifestKind: nonEmptyString(value.manifestKind, "manifestKind"),
    ...(value.primaryKind === undefined ? {} : { primaryKind: nonEmptyString(value.primaryKind, "primaryKind") }),
    documentRoles,
    commonFieldSets: objectFromUnknown(value.commonFieldSets, "commonFieldSets"),
    objectDefinitions: objectFromUnknown(value.objectDefinitions, "objectDefinitions"),
    documents,
    contextViews,
    validationProfiles: objectFromUnknown(value.validationProfiles, "validationProfiles"),
  };
  const manifestDocument = documents[contract.manifestKind] as StoryProfileDocumentSource | undefined;
  if (!manifestDocument || manifestDocument.cardinality !== "one" || manifestDocument.layoutPresence !== "required") {
    throw new Error("manifestKind 必须指向 layoutPresence=required、cardinality=one 的文档类型。");
  }
  if (documentRoles.manifest !== contract.manifestKind) {
    throw new Error("documentRoles.manifest 必须指向 manifestKind。");
  }
  if (contract.primaryKind) {
    const primaryDocument = documents[contract.primaryKind] as StoryProfileDocumentSource | undefined;
    if (!primaryDocument || primaryDocument.layoutPresence !== "required") {
      throw new Error("primaryKind 必须指向 layoutPresence=required 的文档类型。");
    }
    if (documentRoles.primary !== contract.primaryKind) {
      throw new Error("documentRoles.primary 必须指向 primaryKind。");
    }
  }
  return contract as unknown as StoryProfileSource;
};

export const defineStoryProfile = <
  const TDocuments extends Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  const TOptionalKinds extends readonly Extract<keyof TDocuments, string>[],
>(
  input: Readonly<Record<string, unknown>> & {
    readonly profileId: string;
    readonly profileVersion: number;
    readonly documents: TDocuments;
  },
  options: Readonly<{ optionalDocumentKinds: TOptionalKinds }>,
): DefinedStoryProfile<Extract<keyof TDocuments, string>, TOptionalKinds[number]> => {
  type DocumentKind = Extract<keyof TDocuments, string>;
  type OptionalKind = TOptionalKinds[number];
  type RequiredKind = Exclude<DocumentKind, OptionalKind>;

  const source = parseStoryProfile(input);
  const documentKinds = Object.keys(source.documents) as DocumentKind[];
  const declaredOptionalKinds = documentKinds.filter(
    (kind): kind is OptionalKind => source.documents[kind]?.layoutPresence === "optional",
  );
  const configuredOptionalKinds = [...options.optionalDocumentKinds];
  const missingOptionalKinds = declaredOptionalKinds.filter((kind) => !configuredOptionalKinds.includes(kind));
  const incorrectlyOptionalKinds = configuredOptionalKinds.filter(
    (kind) => source.documents[kind]?.layoutPresence !== "optional",
  );
  if (missingOptionalKinds.length > 0 || incorrectlyOptionalKinds.length > 0) {
    throw new Error(
      `Profile 可选文档类型声明不一致；未登记：${missingOptionalKinds.join("、") || "无"}；错误登记：${incorrectlyOptionalKinds.join("、") || "无"}。`,
    );
  }

  const identity = Object.freeze({ id: source.profileId, version: source.profileVersion });
  const optionalDocumentKinds = Object.freeze(configuredOptionalKinds) as readonly OptionalKind[];
  const requiredDocumentKinds = Object.freeze(
    documentKinds.filter((kind): kind is RequiredKind => !configuredOptionalKinds.includes(kind as OptionalKind)),
  );
  const layoutProfile = Object.freeze({ identity, requiredDocumentKinds, optionalDocumentKinds });

  return Object.freeze({
    identity,
    source,
    documentKinds: Object.freeze(documentKinds),
    requiredDocumentKinds,
    optionalDocumentKinds,
    defineLayout: (layout: StoryProjectLayoutInput<RequiredKind, OptionalKind>) =>
      defineStoryProjectLayout(layoutProfile, layout),
  });
};

export const storyProfileContextViewForScope = (contract: StoryProfile, scope: StoryProfileContextView["scope"]) => {
  const entry = Object.entries(contract.contextViews).find(([, view]) => view.scope === scope);
  if (!entry) throw new Error(`工作区故事协议缺少 context view：${scope}`);
  return { name: entry[0], ...entry[1] };
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
