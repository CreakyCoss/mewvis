import {
  parseStoryTypeDefinition,
  resolveStoryTypePath,
  storyTypeDocument,
  storyTypeKindForPath,
} from "../../definitions/definition.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import type {
  JsonFieldMetadata,
  JsonObjectDefinition,
  StoryDocument,
  StoryDocumentDefinition,
  StoryProjectAppliedChanges,
  StoryProjectState,
  StoryValue,
} from "../../types.js";
import type { StoryProjectRecord, StoryProjectRecordWrite, StoryProjectStore } from "../../storage/index.js";
import { parseStoryDocument, serializeStoryDocument } from "../engine/document.js";
import { StoryProjectValidationError } from "../engine/issues.js";
import { assembleProject, manifestFiles } from "../engine/project.js";
import { validateProject } from "../engine/validation.js";

type JsonObject = Record<string, unknown>;

export const PROJECT_CONFIG_PATH = "story/.novel-claw/project.json";

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const readDefinition = async (store: StoryProjectStore, projectKey: string) => {
  const record = await store.read(projectKey, PROJECT_CONFIG_PATH);
  try {
    if (record.contentType !== "json") throw new Error("故事项目定义必须是 JSON 记录。");
    return parseStoryTypeDefinition(record.value);
  } catch (error) {
    throw new Error(`故事项目定义无效：${error instanceof Error ? error.message : String(error)}`);
  }
};

const storedDocument = (definition: StoryTypeDefinition, path: string, value: unknown): StoryProjectRecordWrite => {
  const serialized = serializeStoryDocument(definition, value, path);
  return typeof serialized === "string"
    ? { key: path, contentType: "markdown", value: serialized }
    : { key: path, contentType: "json", value: serialized as StoryValue };
};

const storedDocumentValue = (definition: StoryTypeDefinition, path: string, record: StoryProjectRecord) => {
  const expected = storyTypeDocument(definition, storyTypeKindForPath(definition, path)).contentType;
  if (record.contentType !== expected) {
    throw new Error(`故事记录类型不一致：${path} 期望 ${expected}，实际为 ${record.contentType}。`);
  }
  return record.value;
};

const editorDefinition = (definition: StoryTypeDefinition, path: string): StoryDocumentDefinition => {
  const kind = storyTypeKindForPath(definition, path);
  const document = storyTypeDocument(definition, kind);
  const definitions: Record<string, JsonObjectDefinition> = Object.fromEntries(
    definition.objects.map((object) => [
      object.id,
      {
        ...(object.label ? { label: object.label } : {}),
        fields: Object.fromEntries(object.fields.map(({ key, ...field }) => [key, field as JsonFieldMetadata])),
      },
    ]),
  );
  return {
    kind,
    label: document.label,
    fields: Object.fromEntries(document.fields.map(({ key, ...field }) => [key, field as JsonFieldMetadata])),
    definitions,
  };
};

export const loadProject = async (
  store: StoryProjectStore,
  projectKey: string,
  definition: StoryTypeDefinition,
): Promise<StoryProjectState> => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const manifestRecord = await store.read(projectKey, manifestPath);
  const manifestValue = parseStoryDocument(
    definition,
    storedDocumentValue(definition, manifestPath, manifestRecord),
    manifestPath,
  );
  if (!isObject(manifestValue)) throw new Error("故事 Manifest 必须是 JSON 对象。");
  const entries = await Promise.all(
    manifestFiles(manifestValue).map(async ({ path }) => {
      const record = await store.read(projectKey, path);
      return { path, value: storedDocumentValue(definition, path, record) };
    }),
  );
  const project = assembleProject([{ path: manifestPath, value: manifestValue }, ...entries], definition, manifestPath);
  const validation = validateProject(project, definition, "draft");
  if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
  return project;
};

export const persistAppliedProject = async (
  store: StoryProjectStore,
  projectKey: string,
  definition: StoryTypeDefinition,
  applied: StoryProjectAppliedChanges,
) => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const files = new Map(applied.project.documents.map((entry) => [entry.path, entry.value]));
  const changed = [...new Set(applied.changedPaths)];
  const writes: StoryProjectRecordWrite[] = changed.flatMap((path) => {
    const value = files.get(path);
    return value === undefined ? [] : [storedDocument(definition, path, value)];
  });
  writes.push(storedDocument(definition, manifestPath, applied.project.manifest));
  await store.commit(projectKey, {
    revision: { key: manifestPath, expected: applied.nextRevision - 1 },
    writes,
    deletes: changed.filter((path) => !files.has(path)),
  });
};

export const persistInitialProject = async (
  store: StoryProjectStore,
  projectKey: string,
  definition: StoryTypeDefinition,
  project: StoryProjectState,
  deletes: readonly string[],
) => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const writes: StoryProjectRecordWrite[] = [
    { key: PROJECT_CONFIG_PATH, contentType: "json", value: definition as unknown as StoryValue },
    ...project.documents.map(({ path, value }) => storedDocument(definition, path, value)),
    storedDocument(definition, manifestPath, project.manifest),
  ];
  const writeKeys = new Set(writes.map(({ key }) => key));
  await store.commit(projectKey, {
    revision: { key: manifestPath, expected: null },
    writes,
    deletes: deletes.filter((key) => !writeKeys.has(key)),
  });
};

export const editableDocument = async (
  store: StoryProjectStore,
  projectKey: string,
  definition: StoryTypeDefinition,
  path: string,
): Promise<StoryDocument> => {
  const record = await store.read(projectKey, path);
  return {
    path,
    value: parseStoryDocument(
      definition,
      storedDocumentValue(definition, path, record),
      path,
    ) as StoryDocument["value"],
    definition: editorDefinition(definition, path),
    updatedAt: record.updatedAt,
  };
};
