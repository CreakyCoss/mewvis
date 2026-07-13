import { z } from "zod";
import type { StoryProjectCompiler, StoryProjectCompilerSource } from "./compiler.js";
import { STORY_PROJECT_IDENTIFIERS } from "./identifiers.js";
import {
  parseStoryDocument,
  parseStoryProfile,
  resolveStoryProfilePath,
  serializeStoryDocument,
  storyProfileContextViewForScope,
  storyProfileDocument,
  storyProfileDocumentFields,
  storyProfileKindForPath,
  type StoryProfile,
  type StoryProfileField,
} from "./declarative-profile.js";
import { parseStoryProjectLayout } from "./layout.js";
import type {
  AppliedStoryChanges,
  CompiledStoryProjectFileEntry,
  StoryCompiledProject,
  StoryContextBundle,
  StoryContextSection,
  StoryContextSource,
  StoryProjectApi,
  StoryProfileDescription,
  StoryValidationIssue,
  StoryValidationResult,
} from "./protocol.js";

export const STORY_CHANGE_SET_MAX_OPERATIONS = 16;
export const STORY_CHANGE_SET_MAX_BYTES = 192 * 1024;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const objectValue = (value: unknown, owner: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${owner} 必须是 JSON 对象。`);
  return value;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const pointerKey = (pointer: string) => (pointer.startsWith("/") ? pointer.slice(1) : pointer);
const canonicalPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const documentId = (value: unknown) => {
  if (!isObject(value)) return "";
  return typeof value.id === "string" ? value.id : typeof value.storyId === "string" ? value.storyId : "";
};

const documentKind = (value: unknown) => (isObject(value) && typeof value.kind === "string" ? value.kind : "");

const compiledProfile = (profileInput: unknown, layoutInput: unknown): StoryProfile => {
  const source = parseStoryProfile(profileInput);
  const layout = parseStoryProjectLayout(layoutInput);
  if (layout.profile.id !== source.profileId || layout.profile.version !== source.profileVersion) {
    throw new Error(
      `Layout 选择的 Profile 与快照不一致：${layout.profile.id}@${layout.profile.version} / ${source.profileId}@${source.profileVersion}`,
    );
  }
  const actualKinds = Object.keys(layout.documents).sort();
  const knownKinds = Object.keys(source.documents).sort();
  const missingKinds = knownKinds.filter(
    (kind) => source.documents[kind]!.layoutPresence === "required" && !actualKinds.includes(kind),
  );
  const unknownKinds = actualKinds.filter((kind) => !source.documents[kind]);
  if (missingKinds.length > 0 || unknownKinds.length > 0) {
    throw new Error(
      `Layout 文档映射与 Profile 不一致；缺少必需文档：${missingKinds.join("、") || "无"}；未知文档：${unknownKinds.join("、") || "无"}。`,
    );
  }
  const enabledKinds = new Set(actualKinds);
  for (const [kind, document] of Object.entries(source.documents)) {
    if (!enabledKinds.has(kind)) continue;
    for (const companionKind of document.companionKinds ?? []) {
      if (!source.documents[companionKind]) throw new Error(`${kind} 引用了未知 companionKind：${companionKind}`);
      if (!enabledKinds.has(companionKind)) {
        throw new Error(`Layout 启用了 ${kind}，但未启用其配套文档 ${companionKind}。`);
      }
    }
  }

  const rootPath = canonicalPath(layout.rootPath);
  const paths = new Map<string, string>();
  for (const [kind, document] of Object.entries(layout.documents)) {
    const pathPattern = canonicalPath(document.pathPattern);
    if (
      !pathPattern.startsWith(`${rootPath}/`) ||
      pathPattern.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Layout 的 ${kind} 路径必须位于 ${rootPath}/ 下：${document.pathPattern}`);
    }
    const owner = paths.get(pathPattern);
    if (owner) throw new Error(`Layout 文档路径重复：${owner} 与 ${kind} 都使用 ${pathPattern}。`);
    paths.set(pathPattern, kind);
  }

  const contextViews = Object.fromEntries(
    Object.entries(source.contextViews).map(([name, view]) => {
      if (view.targetKind && !enabledKinds.has(view.targetKind)) {
        throw new Error(`Layout 未启用 contextViews.${name}.targetKind：${view.targetKind}`);
      }
      const documentKinds = view.documentKinds.filter((kind) => enabledKinds.has(kind));
      if (documentKinds.length === 0) throw new Error(`Layout 使 contextViews.${name} 不再包含任何文档。`);
      return [name, { ...view, documentKinds }];
    }),
  );
  const documentRoles = Object.fromEntries(
    Object.entries(source.documentRoles).filter(([, kind]) => enabledKinds.has(kind)),
  );

  return {
    ...source,
    rootPath,
    documentRoles,
    contextViews,
    documents: Object.fromEntries(
      actualKinds.map((kind) => [
        kind,
        { ...source.documents[kind]!, pathPattern: layout.documents[kind]!.pathPattern },
      ]),
    ),
  };
};

const emptyFieldValue = (profile: StoryProfile, field: StoryProfileField, timestamp: number): unknown => {
  if (field.const !== undefined) return clone(field.const);
  if (field.default !== undefined) return clone(field.default);
  if (field.generated && field.type === "timestamp") return timestamp;
  if (field.definition) {
    const definition = profile.objectDefinitions[field.definition];
    if (!definition) throw new Error(`Profile 缺少对象定义：${field.definition}`);
    return Object.fromEntries(
      Object.entries(definition.fields)
        .filter(([, child]) => child.required || child.default !== undefined || child.const !== undefined)
        .map(([pointer, child]) => [pointerKey(pointer), emptyFieldValue(profile, child, timestamp)]),
    );
  }
  if (field.itemDefinition || field.type === "collection" || field.type.endsWith("-list")) return [];
  if (field.type === "boolean") return false;
  if (["integer", "number", "timestamp"].includes(field.type)) return 0;
  if (field.options?.length) return field.options[0]!.value;
  return "";
};

const initialDocumentInput = (
  profile: StoryProfile,
  kind: string,
  storyId: string,
  title: string,
  timestamp: number,
) => {
  const fields = storyProfileDocumentFields(profile, kind);
  const result: JsonObject = {};
  for (const [pointer, field] of Object.entries(fields)) {
    const key = pointerKey(pointer);
    if (key === "storyId") result[key] = storyId;
    else if (key === "id")
      result[key] = kind === profile.primaryKind ? storyId : `${storyId}-${kind.replace(/^story-/, "")}`;
    else if (key === "title") result[key] = title;
    else if (key === "revision") result[key] = 0;
    else if (key === "files") result[key] = [];
    else if (key === "createdAt" || key === "updatedAt") result[key] = timestamp;
    else if (field.required || field.default !== undefined || field.const !== undefined) {
      result[key] = emptyFieldValue(profile, field, timestamp);
    }
  }
  return result;
};

const storyChangeSetBatchSchema = z
  .object({
    workflowId: z.string().trim().min(1),
    index: z.number().int().positive(),
    total: z.number().int().positive().optional(),
    label: z.string().trim().min(1),
    final: z.boolean(),
  })
  .strict();

const storyChangeSetOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upsert"), path: z.string().trim().min(1), value: z.unknown() }).strict(),
  z.object({ type: z.literal("delete"), path: z.string().trim().min(1) }).strict(),
  z
    .object({ type: z.literal("patch"), path: z.string().trim().min(1), value: z.record(z.string(), z.unknown()) })
    .strict(),
  z
    .object({
      type: z.literal("upsert-items"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      items: z.array(z.record(z.string(), z.unknown())).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("remove-items"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      ids: z.array(z.string().trim().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("add-values"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      values: z.array(z.string()).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("remove-values"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      values: z.array(z.string()).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("append-text"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      value: z.string().min(1),
      separator: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("replace-text"),
      path: z.string().trim().min(1),
      field: z.string().trim().min(1),
      oldText: z.string().min(1),
      newText: z.string(),
    })
    .strict(),
]);

export const storyChangeSetSchema = z
  .object({
    profileId: z.string().trim().min(1),
    profileVersion: z.number().int().positive(),
    storyId: z.string().trim().min(1),
    baseRevision: z.number().int().nonnegative(),
    validationProfile: z.string().trim().min(1),
    batch: storyChangeSetBatchSchema.optional(),
    operations: z.array(storyChangeSetOperationSchema).min(1).max(STORY_CHANGE_SET_MAX_OPERATIONS),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.batch?.total !== undefined && value.batch.index > value.batch.total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["batch", "index"],
        message: "批次 index 不能大于 total。",
      });
    }
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (bytes > STORY_CHANGE_SET_MAX_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operations"],
        message: `ChangeSet 不能超过 ${STORY_CHANGE_SET_MAX_BYTES} 字节，当前为 ${bytes} 字节；请拆成多个批次。`,
      });
    }
  });

const projectValue = (input: StoryCompiledProject) => input;

const manifestFiles = (manifest: JsonObject) => {
  if (!Array.isArray(manifest.files)) throw new Error("故事 Manifest files 必须是数组。");
  return manifest.files.map((item, index) => {
    const value = objectValue(item, `manifest.files[${index}]`);
    if (typeof value.path !== "string" || typeof value.kind !== "string" || typeof value.id !== "string") {
      throw new Error(`manifest.files[${index}] 缺少 path、kind 或 id。`);
    }
    return { path: value.path, kind: value.kind, id: value.id };
  });
};

const projectInfo = (project: StoryCompiledProject) => {
  const manifest = projectValue(project).manifest;
  if (typeof manifest.storyId !== "string" || !Number.isInteger(manifest.revision)) {
    throw new Error("故事 Manifest 缺少 storyId 或 revision。");
  }
  return { storyId: manifest.storyId, revision: Number(manifest.revision) };
};

const rebuildManifest = (
  project: StoryCompiledProject,
  profile: StoryProfile,
  revision: number,
  timestamp = Date.now(),
): StoryCompiledProject => {
  const documents = [...project.documents].sort((left, right) => left.path.localeCompare(right.path));
  const primary = profile.primaryKind
    ? documents.find((entry) => documentKind(entry.value) === profile.primaryKind)?.value
    : undefined;
  const manifest = {
    ...project.manifest,
    ...(isObject(primary) && typeof primary.title === "string" ? { title: primary.title } : {}),
    revision,
    updatedAt: timestamp,
    files: documents.map(({ path, value }) => ({ kind: documentKind(value), id: documentId(value), path })),
  };
  return { manifest, documents };
};

const assembleProject = (
  entries: readonly CompiledStoryProjectFileEntry[],
  profile: StoryProfile,
  manifestPath: string,
): StoryCompiledProject => {
  const manifestEntries = entries.filter((entry) => canonicalPath(entry.path) === manifestPath);
  if (manifestEntries.length !== 1)
    throw new Error(`故事项目必须且只能包含一个 Manifest，当前为 ${manifestEntries.length} 个。`);
  const documents = entries
    .filter((entry) => canonicalPath(entry.path) !== manifestPath)
    .map((entry) => {
      const path = canonicalPath(entry.path);
      const kind = storyProfileKindForPath(profile, path);
      if (kind === profile.manifestKind) throw new Error("Manifest 不得出现在普通文档集合中。");
      const value = parseStoryDocument(profile, entry.value, path);
      if (documentKind(value) !== kind) throw new Error(`${path} 的 kind 与 Profile 不一致。`);
      return { path, value };
    });
  const paths = documents.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error("故事项目包含重复文件路径。");
  for (const [kind, definition] of Object.entries(profile.documents)) {
    if (kind === profile.manifestKind) continue;
    const count = documents.filter((entry) => documentKind(entry.value) === kind).length;
    if (definition.cardinality === "one" && count !== 1) {
      throw new Error(`故事项目必须且只能包含一个 ${kind}，当前为 ${count} 个。`);
    }
  }
  return {
    manifest: parseStoryDocument(profile, manifestEntries[0]!.value, manifestPath),
    documents: documents.sort((left, right) => left.path.localeCompare(right.path)),
  };
};

const issue = (code: string, path: string, message: string): StoryValidationIssue => ({
  severity: "error",
  code,
  path,
  message,
});

const walkFields = (
  profile: StoryProfile,
  fields: Readonly<Record<string, StoryProfileField>>,
  value: JsonObject,
  visitor: (field: StoryProfileField, value: unknown, path: string) => void,
  basePath: string,
) => {
  for (const [pointer, field] of Object.entries(fields)) {
    const key = pointerKey(pointer);
    const item = value[key];
    visitor(field, item, `${basePath}.${key}`);
    if (field.definition && isObject(item)) {
      const definition = profile.objectDefinitions[field.definition];
      if (definition) walkFields(profile, definition.fields, item, visitor, `${basePath}.${key}`);
    }
    if (field.itemDefinition && Array.isArray(item)) {
      const definition = profile.objectDefinitions[field.itemDefinition];
      if (definition) {
        item.forEach((child, index) => {
          if (isObject(child)) walkFields(profile, definition.fields, child, visitor, `${basePath}.${key}[${index}]`);
        });
      }
    }
  }
};

const definitionIds = (project: StoryCompiledProject, profile: StoryProfile, issues: StoryValidationIssue[]) => {
  const result = new Map<string, Set<string>>();
  const collect = (definitionName: string, value: unknown, path: string) => {
    if (!isObject(value) || typeof value.id !== "string" || !value.id) return;
    const ids = result.get(definitionName) ?? new Set<string>();
    if (ids.has(value.id))
      issues.push(issue("identity.duplicate", path, `${definitionName} 的 ID「${value.id}」重复。`));
    ids.add(value.id);
    result.set(definitionName, ids);
  };
  const visit = (fields: Readonly<Record<string, StoryProfileField>>, value: JsonObject, basePath: string) => {
    for (const [pointer, field] of Object.entries(fields)) {
      const key = pointerKey(pointer);
      const item = value[key];
      if (field.definition && isObject(item)) {
        collect(field.definition, item, `${basePath}.${key}`);
        const definition = profile.objectDefinitions[field.definition];
        if (definition) visit(definition.fields, item, `${basePath}.${key}`);
      }
      if (field.itemDefinition && Array.isArray(item)) {
        const definition = profile.objectDefinitions[field.itemDefinition];
        item.forEach((child, index) => {
          collect(field.itemDefinition!, child, `${basePath}.${key}[${index}]`);
          if (definition && isObject(child)) visit(definition.fields, child, `${basePath}.${key}[${index}]`);
        });
      }
    }
  };
  for (const entry of project.documents) {
    const kind = documentKind(entry.value);
    if (isObject(entry.value)) visit(storyProfileDocumentFields(profile, kind), entry.value, entry.path);
  }
  return result;
};

const validateProject = (
  project: StoryCompiledProject,
  profile: StoryProfile,
  validationProfile: string,
): StoryValidationResult => {
  if (!profile.validationProfiles[validationProfile]) throw new Error(`Profile 不支持校验模式：${validationProfile}`);
  const issues: StoryValidationIssue[] = [];
  const info = projectInfo(project);
  const declared = manifestFiles(project.manifest);
  const actual = project.documents.map(({ path, value }) => ({
    path,
    kind: documentKind(value),
    id: documentId(value),
  }));
  if (new Set(actual.map((item) => item.path)).size !== actual.length)
    issues.push(issue("identity.duplicate", "project", "文件路径重复。"));
  for (const entry of actual) {
    if (!declared.some((item) => item.path === entry.path && item.kind === entry.kind && item.id === entry.id)) {
      issues.push(issue("manifest.file_missing", "manifest.files", `Manifest 缺少文件：${entry.path}`));
    }
  }
  for (const entry of declared) {
    if (!actual.some((item) => item.path === entry.path && item.kind === entry.kind && item.id === entry.id)) {
      issues.push(issue("manifest.file_stale", "manifest.files", `Manifest 包含不存在的文件：${entry.path}`));
    }
  }
  const idsByKind = new Map<string, Set<string>>();
  for (const entry of project.documents) {
    const kind = documentKind(entry.value);
    const id = documentId(entry.value);
    const ids = idsByKind.get(kind) ?? new Set<string>();
    if (id && ids.has(id)) issues.push(issue("identity.duplicate", entry.path, `${kind} 的 ID「${id}」重复。`));
    if (id) ids.add(id);
    idsByKind.set(kind, ids);
  }
  const idsByDefinition = definitionIds(project, profile, issues);
  for (const entry of project.documents) {
    const kind = documentKind(entry.value);
    if (!isObject(entry.value)) continue;
    walkFields(
      profile,
      storyProfileDocumentFields(profile, kind),
      entry.value,
      (field, fieldValue, path) => {
        if (
          (!field.targetKinds?.length && !field.targetObjectDefinitions?.length) ||
          fieldValue === undefined ||
          fieldValue === ""
        )
          return;
        const references = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
        for (const reference of references) {
          if (typeof reference !== "string") continue;
          const matchedKind =
            field.targetKinds?.some((targetKind) => idsByKind.get(targetKind)?.has(reference)) ?? false;
          const matchedDefinition =
            field.targetObjectDefinitions?.some((definition) => idsByDefinition.get(definition)?.has(reference)) ??
            false;
          if (!matchedKind && !matchedDefinition) {
            const targets = [...(field.targetKinds ?? []), ...(field.targetObjectDefinitions ?? [])];
            issues.push(
              issue("reference.missing", path, `引用「${reference}」未指向 ${targets.join("、")} 中的现有对象。`),
            );
          }
        }
      },
      entry.path,
    );
    for (const companionKind of storyProfileDocument(profile, kind).companionKinds ?? []) {
      const id = documentId(entry.value);
      if (id && !idsByKind.get(companionKind)?.has(id)) {
        issues.push(issue("companion.missing", entry.path, `${kind}「${id}」缺少配套文档 ${companionKind}。`));
      }
    }
  }
  if (!info.storyId) issues.push(issue("manifest.story_id", "manifest.storyId", "故事 ID 不能为空。"));
  return { valid: issues.every((item) => item.severity !== "error"), issues };
};

const deepMerge = (current: unknown, patch: JsonObject): JsonObject => {
  const result = isObject(current) ? { ...current } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else if (isObject(value)) result[key] = deepMerge(result[key], value);
    else result[key] = value;
  }
  return result;
};

const assertPatchFields = (profile: StoryProfile, kind: string, patch: JsonObject) => {
  const fields = storyProfileDocumentFields(profile, kind);
  for (const key of Object.keys(patch)) {
    const field = fields[`/${key}`];
    if (!field) throw new Error(`${kind} 未声明字段：${key}`);
    if (field.readOnly || field.immutable || field.generated || field.const !== undefined) {
      throw new Error(`patch 不允许修改受保护字段：${key}`);
    }
  }
};

const requireObjectDocument = (files: Map<string, unknown>, path: string) => {
  const value = files.get(path);
  if (!isObject(value)) throw new Error(`增量操作要求 JSON 文件已存在：${path}`);
  return value;
};

const applyChangeSet = (
  current: StoryCompiledProject,
  input: unknown,
  api: StoryProjectApi,
  profile: StoryProfile,
): AppliedStoryChanges => {
  const changeSet = storyChangeSetSchema.parse(input);
  if (changeSet.profileId !== api.identity.profileId || changeSet.profileVersion !== api.identity.profileVersion) {
    throw new Error(
      `ChangeSet Profile 与工作区不一致：期望 ${api.identity.profileId}@${api.identity.profileVersion}。`,
    );
  }
  const info = projectInfo(current);
  if (changeSet.storyId !== info.storyId) throw new Error("ChangeSet storyId 与当前故事不一致。");
  if (changeSet.baseRevision !== info.revision) {
    throw new Error(`故事已被更新：期望 revision ${changeSet.baseRevision}，当前为 ${info.revision}。`);
  }
  if (!profile.validationProfiles[changeSet.validationProfile]) {
    throw new Error(`Profile 不支持校验模式：${changeSet.validationProfile}`);
  }
  const manifestPath = api.projectManifestPath();
  const files = new Map(current.documents.map((entry) => [entry.path, clone(entry.value)]));
  const timestamp = Date.now();
  for (const operation of changeSet.operations) {
    const path = canonicalPath(operation.path);
    if (path === manifestPath) throw new Error("Manifest 只能由故事运行时生成，不能直接修改。");
    const kind = api.kindForPath(path);
    const definition = api.document(kind);
    switch (operation.type) {
      case "delete":
        if (definition.cardinality === "one") throw new Error(`${definition.label} 必须保留一份，不能删除。`);
        files.delete(path);
        break;
      case "upsert":
        files.set(path, api.materializeDocument(operation.value, path, timestamp));
        break;
      case "patch": {
        if (definition.contentType === "markdown") throw new Error("Markdown 文档不支持 patch，请使用文本操作。");
        assertPatchFields(profile, kind, operation.value);
        files.set(
          path,
          api.materializeDocument(deepMerge(requireObjectDocument(files, path), operation.value), path, timestamp),
        );
        break;
      }
      case "upsert-items": {
        const file = requireObjectDocument(files, path);
        assertPatchFields(profile, kind, { [operation.field]: operation.items });
        const currentItems = file[operation.field];
        if (!Array.isArray(currentItems)) throw new Error(`${path}.${operation.field} 必须是数组。`);
        const next = [...currentItems];
        for (const item of operation.items) {
          if (typeof item.id !== "string") throw new Error("upsert-items 的每个对象必须包含字符串 id。");
          const index = next.findIndex((candidate) => isObject(candidate) && candidate.id === item.id);
          if (index >= 0) next[index] = deepMerge(next[index], item);
          else next.push(item);
        }
        files.set(path, api.materializeDocument({ ...file, [operation.field]: next }, path, timestamp));
        break;
      }
      case "remove-items": {
        const file = requireObjectDocument(files, path);
        assertPatchFields(profile, kind, { [operation.field]: [] });
        const currentItems = file[operation.field];
        if (!Array.isArray(currentItems)) throw new Error(`${path}.${operation.field} 必须是数组。`);
        files.set(
          path,
          api.materializeDocument(
            {
              ...file,
              [operation.field]: currentItems.filter(
                (item) => !isObject(item) || typeof item.id !== "string" || !operation.ids.includes(item.id),
              ),
            },
            path,
            timestamp,
          ),
        );
        break;
      }
      case "add-values":
      case "remove-values": {
        const file = requireObjectDocument(files, path);
        assertPatchFields(profile, kind, { [operation.field]: operation.values });
        const currentValues = file[operation.field];
        if (!Array.isArray(currentValues) || currentValues.some((item) => typeof item !== "string")) {
          throw new Error(`${path}.${operation.field} 必须是字符串数组。`);
        }
        const next =
          operation.type === "add-values"
            ? [...new Set([...currentValues, ...operation.values])]
            : currentValues.filter((item) => !operation.values.includes(item));
        files.set(path, api.materializeDocument({ ...file, [operation.field]: next }, path, timestamp));
        break;
      }
      case "append-text":
      case "replace-text": {
        const file = requireObjectDocument(files, path);
        const field = operation.field;
        if (definition.contentType !== "markdown") assertPatchFields(profile, kind, { [field]: "" });
        if (typeof file[field] !== "string") throw new Error(`${path}.${field} 必须是字符串。`);
        const next =
          operation.type === "append-text"
            ? `${file[field]}${file[field] ? (operation.separator ?? "\n") : ""}${operation.value}`
            : (() => {
                if (!file[field].includes(operation.oldText)) throw new Error(`${path}.${field} 未找到待替换文本。`);
                return file[field].replace(operation.oldText, operation.newText);
              })();
        files.set(path, api.materializeDocument({ ...file, [field]: next }, path, timestamp));
        break;
      }
    }
  }
  const nextBase: StoryCompiledProject = {
    manifest: current.manifest,
    documents: [...files].map(([path, value]) => ({ path, value })),
  };
  const next = rebuildManifest(nextBase, profile, info.revision + 1, timestamp);
  const validation = validateProject(next, profile, changeSet.validationProfile);
  if (!validation.valid) throw new Error(validation.issues.map((item) => `${item.path}：${item.message}`).join("\n"));
  return {
    project: next,
    nextRevision: info.revision + 1,
    validation,
    batch: changeSet.batch ?? null,
    operationTypes: [...new Set(changeSet.operations.map((item) => item.type))],
    changedPaths: [...new Set(changeSet.operations.map((item) => canonicalPath(item.path)))],
  };
};

const displayScalar = (field: StoryProfileField, value: unknown) => {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return field.options?.find((item) => item.value === value)?.label ?? value;
  return String(value ?? "");
};

const renderFields = (
  profile: StoryProfile,
  fields: Readonly<Record<string, StoryProfileField>>,
  value: JsonObject,
  indent = "",
) =>
  Object.entries(fields).flatMap(([pointer, field]): string[] => {
    const key = pointerKey(pointer);
    const item = value[key];
    if (item === undefined || item === null || item === "" || (Array.isArray(item) && item.length === 0)) return [];
    if (["schemaVersion", "kind", "updatedAt", "createdAt", "files"].includes(key)) return [];
    const prefix = `${indent}- ${field.label}：`;
    if (field.definition && isObject(item)) {
      const definition = profile.objectDefinitions[field.definition];
      return definition
        ? [`${prefix}`, ...renderFields(profile, definition.fields, item, `${indent}  `)]
        : [`${prefix}${JSON.stringify(item)}`];
    }
    if (field.itemDefinition && Array.isArray(item)) {
      const definition = profile.objectDefinitions[field.itemDefinition];
      return definition
        ? [
            `${prefix}`,
            ...item.flatMap((child, index) =>
              isObject(child)
                ? [`${indent}  ${index + 1}.`, ...renderFields(profile, definition.fields, child, `${indent}     `)]
                : [`${indent}  ${index + 1}. ${String(child)}`],
            ),
          ]
        : [`${prefix}${JSON.stringify(item)}`];
    }
    if (Array.isArray(item)) return [`${prefix}${item.join("、")}`];
    return [`${prefix}${displayScalar(field, item)}`];
  });

const readContext = (
  project: StoryCompiledProject,
  profile: StoryProfile,
  api: StoryProjectApi,
  input: { scope: "project" | "chapter"; targetId?: string },
): StoryContextBundle => {
  const view = storyProfileContextViewForScope(profile, input.scope);
  const candidates = project.documents.filter((entry) => view.documentKinds.includes(documentKind(entry.value)));
  const target =
    input.scope === "chapter" && view.targetKind
      ? candidates.find((entry) => {
          if (documentKind(entry.value) !== view.targetKind || !isObject(entry.value)) return false;
          const value = entry.value;
          return (view.targetSelectors ?? ["/id"]).some(
            (pointer) => String(value[pointerKey(pointer)] ?? "") === input.targetId,
          );
        })
      : undefined;
  if (input.scope === "chapter" && !target) throw new Error(`找不到章节上下文目标：${input.targetId ?? ""}`);
  const orderedKinds = [target ? documentKind(target.value) : "", ...view.documentKinds].filter(
    (kind, index, all) => kind && all.indexOf(kind) === index,
  );
  const sections = orderedKinds.flatMap((kind, index): StoryContextSection[] => {
    const entries = candidates.filter((entry) => documentKind(entry.value) === kind);
    if (entries.length === 0) return [];
    const sources: StoryContextSource[] = entries.map((entry) => ({
      kind,
      label: api.document(kind).label,
      path: entry.path,
      ...(documentId(entry.value) ? { id: documentId(entry.value) } : {}),
    }));
    const content = entries
      .map((entry) => {
        if (!isObject(entry.value)) return String(entry.value);
        const heading =
          typeof entry.value.title === "string"
            ? entry.value.title
            : typeof entry.value.name === "string"
              ? entry.value.name
              : documentId(entry.value);
        const body = renderFields(profile, storyProfileDocumentFields(profile, kind), entry.value).join("\n");
        return entries.length > 1 && heading ? `### ${heading}\n\n${body}` : body;
      })
      .filter(Boolean)
      .join("\n\n");
    return content
      ? [
          {
            id: kind,
            label: api.document(kind).label,
            priority: 100 - index,
            required: entryIsTarget(entries, target),
            content,
            sources,
          },
        ]
      : [];
  });
  const targetValue = target && isObject(target.value) ? target.value : undefined;
  const targetLabel = targetValue
    ? typeof targetValue.title === "string"
      ? targetValue.number
        ? `第 ${String(targetValue.number)} 章《${targetValue.title}》`
        : targetValue.title
      : documentId(targetValue)
    : "";
  const sources = [
    ...new Map(sections.flatMap((section) => section.sources).map((source) => [source.path, source])).values(),
  ];
  return {
    scope: input.scope,
    revision: projectInfo(project).revision,
    target: target ? { kind: documentKind(target.value), id: documentId(target.value), label: targetLabel } : null,
    sections,
    sources,
    text: [
      `# ${view.label}${targetLabel ? `：${targetLabel}` : ""}`,
      ...sections.map((section) => `## ${section.label}\n\n${section.content}`),
    ].join("\n\n"),
  };
};

const entryIsTarget = (entries: readonly CompiledStoryProjectFileEntry[], target?: CompiledStoryProjectFileEntry) =>
  Boolean(target && entries.some((entry) => entry.path === target.path));

const createApi = (profile: StoryProfile): StoryProjectApi => {
  let api: StoryProjectApi;
  api = {
    compiler: {
      format: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format,
      version: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.version,
    },
    identity: { format: profile.$format, profileId: profile.profileId, profileVersion: profile.profileVersion },
    changeSet: {
      maxOperations: STORY_CHANGE_SET_MAX_OPERATIONS,
      maxBytes: STORY_CHANGE_SET_MAX_BYTES,
      operations: [
        "upsert",
        "delete",
        "patch",
        "upsert-items",
        "remove-items",
        "add-values",
        "remove-values",
        "append-text",
        "replace-text",
      ],
      atomicCommit: true,
      revisionRequired: true,
    },
    describe: () => profile as StoryProfileDescription,
    document: (kind) => storyProfileDocument(profile, kind),
    documentFields: (kind) => storyProfileDocumentFields(profile, kind),
    contextView: (scope) => storyProfileContextViewForScope(profile, scope),
    resolveDocument: (kind, parameters) => resolveStoryProfilePath(profile, kind, parameters),
    kindForPath: (path) => storyProfileKindForPath(profile, path),
    materializeDocument: (input, path, timestamp) => parseStoryDocument(profile, input, path, timestamp),
    encodeDocument: (input, path) => serializeStoryDocument(profile, input, path),
    decodeDocument: (input, path) => parseStoryDocument(profile, input, path),
    projectManifestPath: () => resolveStoryProfilePath(profile, profile.manifestKind),
    createProject: ({ storyId, title, timestamp = Date.now() }) => {
      const normalizedStoryId = storyId.trim();
      if (!normalizedStoryId || !/^[A-Za-z0-9_-]+$/.test(normalizedStoryId))
        throw new Error("storyId 必须是安全稳定 ID。");
      const normalizedTitle = title.trim() || "未命名故事";
      const manifestPath = resolveStoryProfilePath(profile, profile.manifestKind);
      const documents = Object.entries(profile.documents)
        .filter(([kind, definition]) => kind !== profile.manifestKind && definition.cardinality === "one")
        .map(([kind]) => {
          const path = resolveStoryProfilePath(profile, kind);
          return {
            path,
            value: parseStoryDocument(
              profile,
              initialDocumentInput(profile, kind, normalizedStoryId, normalizedTitle, timestamp),
              path,
              timestamp,
            ),
          };
        });
      const manifest = parseStoryDocument(
        profile,
        initialDocumentInput(profile, profile.manifestKind, normalizedStoryId, normalizedTitle, timestamp),
        manifestPath,
        timestamp,
      );
      const project = rebuildManifest({ manifest, documents }, profile, 0, timestamp);
      const validation = validateProject(project, profile, "draft");
      if (!validation.valid)
        throw new Error(validation.issues.map((item) => `${item.path}：${item.message}`).join("\n"));
      return project;
    },
    parseManifest: (input) => {
      const value = objectValue(input, "故事 Manifest");
      const info = projectInfo({ manifest: value, documents: [] });
      return { value, ...info, files: manifestFiles(value) };
    },
    assembleProject: (entries) => assembleProject(entries, profile, api.projectManifestPath()),
    projectFiles: (project) => [...project.documents],
    projectManifest: (project) => project.manifest,
    projectInfo,
    validateProject: (project, validationProfile) => validateProject(project, profile, validationProfile),
    applyChanges: (project, changeSet) => applyChangeSet(project, changeSet, api, profile),
    readContext: (project, input) => readContext(project, profile, api, input),
  };
  return Object.freeze(api);
};

export const DECLARATIVE_STORY_PROJECT_COMPILER: StoryProjectCompiler = Object.freeze({
  format: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format,
  compilerVersion: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.version,
  compile(source: StoryProjectCompilerSource) {
    return createApi(compiledProfile(source.profile, source.layout));
  },
});
