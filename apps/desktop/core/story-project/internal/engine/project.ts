import type { StoryProjectFileEntry, StoryProjectState } from "../../types.js";
import { parseStoryDocument } from "./document.js";
import { StoryDefinition } from "../../definitions/index.js";
import type { StoryFieldDefinition } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const objectValue = (value: unknown, owner: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${owner} 必须是 JSON 对象。`);
  return value;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
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

const emptyFieldValue = (definition: StoryTypeDefinition, field: StoryFieldDefinition, timestamp: number): unknown => {
  if (field.const !== undefined) return clone(field.const);
  if (field.default !== undefined) return clone(field.default);
  if (field.generated && field.type === "timestamp") return timestamp;
  if (field.definition) {
    const fields = StoryDefinition.objectFields(definition, field.definition);
    return Object.fromEntries(
      Object.entries(fields)
        .filter(([, child]) => child.required || child.default !== undefined || child.const !== undefined)
        .map(([key, child]) => [key, emptyFieldValue(definition, child, timestamp)]),
    );
  }
  if (field.itemDefinition || field.type === "collection" || field.type.endsWith("-list")) return [];
  if (field.type === "boolean") return false;
  if (["integer", "number", "timestamp"].includes(field.type)) return 0;
  if (field.options?.length) return field.options[0]!.value;
  return "";
};

export const initialDocumentInput = (
  definition: StoryTypeDefinition,
  kind: string,
  storyId: string,
  title: string,
  timestamp: number,
) => {
  const fields = StoryDefinition.fields(definition, kind);
  const result: JsonObject = {};
  for (const [key, field] of Object.entries(fields)) {
    if (key === "storyId") result[key] = storyId;
    else if (key === "id")
      result[key] = kind === definition.primaryKind ? storyId : `${storyId}-${kind.replace(/^story-/, "")}`;
    else if (key === "title") result[key] = title;
    else if (key === "revision") result[key] = 0;
    else if (key === "files") result[key] = [];
    else if (key === "createdAt" || key === "updatedAt") result[key] = timestamp;
    else if (field.required || field.default !== undefined || field.const !== undefined) {
      result[key] = emptyFieldValue(definition, field, timestamp);
    }
  }
  return result;
};

export const createInitialProject = (
  definition: StoryTypeDefinition,
  input: { storyId: string; title: string },
  timestamp = Date.now(),
) => {
  const manifestPath = StoryDefinition.resolvePath(definition, definition.manifestKind);
  const manifest = parseStoryDocument(
    definition,
    initialDocumentInput(definition, definition.manifestKind, input.storyId, input.title, timestamp),
    manifestPath,
    timestamp,
  );
  if (!isObject(manifest)) throw new Error("故事 Manifest 必须是 JSON 对象。");
  const documents = definition.documents.flatMap((document) => {
    if (document.kind === definition.manifestKind || document.cardinality !== "one") return [];
    const path = StoryDefinition.resolvePath(definition, document.kind);
    return [
      {
        path,
        value: parseStoryDocument(
          definition,
          initialDocumentInput(definition, document.kind, input.storyId, input.title, timestamp),
          path,
          timestamp,
        ),
      },
    ];
  });
  return rebuildManifest({ manifest, documents }, definition, 0, timestamp);
};

const projectValue = (input: StoryProjectState) => input;

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

export const projectInfo = (project: StoryProjectState) => {
  const manifest = projectValue(project).manifest;
  if (typeof manifest.storyId !== "string" || !Number.isInteger(manifest.revision)) {
    throw new Error("故事 Manifest 缺少 storyId 或 revision。");
  }
  return { storyId: manifest.storyId, revision: Number(manifest.revision) };
};

export const rebuildManifest = (
  project: StoryProjectState,
  definition: StoryTypeDefinition,
  revision: number,
  timestamp = Date.now(),
): StoryProjectState => {
  const documents = [...project.documents].sort((left, right) => left.path.localeCompare(right.path));
  const primary = definition.primaryKind
    ? documents.find((entry) => documentKind(entry.value) === definition.primaryKind)?.value
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
  entries: readonly StoryProjectFileEntry[],
  definition: StoryTypeDefinition,
  manifestPath: string,
): StoryProjectState => {
  const manifestEntries = entries.filter((entry) => canonicalPath(entry.path) === manifestPath);
  if (manifestEntries.length !== 1)
    throw new Error(`故事项目必须且只能包含一个 Manifest，当前为 ${manifestEntries.length} 个。`);
  const documents = entries
    .filter((entry) => canonicalPath(entry.path) !== manifestPath)
    .map((entry) => {
      const path = canonicalPath(entry.path);
      const kind = StoryDefinition.kindForPath(definition, path);
      if (kind === definition.manifestKind) throw new Error("Manifest 不得出现在普通文档集合中。");
      const value = parseStoryDocument(definition, entry.value, path);
      if (documentKind(value) !== kind) throw new Error(`${path} 的 kind 与故事类型不一致。`);
      return { path, value };
    });
  const paths = documents.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error("故事项目包含重复文件路径。");
  for (const document of definition.documents) {
    const kind = document.kind;
    if (kind === definition.manifestKind) continue;
    const count = documents.filter((entry) => documentKind(entry.value) === kind).length;
    if (document.cardinality === "one" && count !== 1) {
      throw new Error(`故事项目必须且只能包含一个 ${kind}，当前为 ${count} 个。`);
    }
  }
  return {
    manifest: parseStoryDocument(definition, manifestEntries[0]!.value, manifestPath),
    documents: documents.sort((left, right) => left.path.localeCompare(right.path)),
  };
};
