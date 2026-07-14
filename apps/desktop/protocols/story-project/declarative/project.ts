import type { CompiledStoryProjectFileEntry, StoryCompiledProject } from "../types.js";
import { parseStoryDocument } from "./documents.js";
import {
  storyProfileDocumentFields,
  storyProfileKindForPath,
  type StoryProfile,
  type StoryProfileField,
} from "./profile.js";

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

export const initialDocumentInput = (
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

const projectValue = (input: StoryCompiledProject) => input;

export const manifestFiles = (manifest: JsonObject) => {
  if (!Array.isArray(manifest.files)) throw new Error("故事 Manifest files 必须是数组。");
  return manifest.files.map((item, index) => {
    const value = objectValue(item, `manifest.files[${index}]`);
    if (typeof value.path !== "string" || typeof value.kind !== "string" || typeof value.id !== "string") {
      throw new Error(`manifest.files[${index}] 缺少 path、kind 或 id。`);
    }
    return { path: value.path, kind: value.kind, id: value.id };
  });
};

export const projectInfo = (project: StoryCompiledProject) => {
  const manifest = projectValue(project).manifest;
  if (typeof manifest.storyId !== "string" || !Number.isInteger(manifest.revision)) {
    throw new Error("故事 Manifest 缺少 storyId 或 revision。");
  }
  return { storyId: manifest.storyId, revision: Number(manifest.revision) };
};

export const rebuildManifest = (
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

export const assembleProject = (
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
