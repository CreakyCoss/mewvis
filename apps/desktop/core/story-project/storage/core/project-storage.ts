import {
  parseStoryTypeDefinition,
  resolveStoryTypePath,
  storyTypeDocument,
  storyTypeKindForPath,
} from "../../definitions/definition.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import type { StoryDocument, StoryProjectAppliedChanges, StoryProjectState, StoryValue } from "../../types.js";
import { parseStoryDocument, serializeStoryDocument } from "../../internal/engine/document.js";
import { StoryProjectValidationError } from "../../internal/engine/issues.js";
import { assembleProject, manifestFiles } from "../../internal/engine/project.js";
import { validateProject } from "../../internal/engine/validation.js";
import type { StoryProjectStorage } from "../index.js";
import type { StoryProjectRecord, StoryProjectRecordBackend, StoryProjectRecordWrite } from "./backend.js";
import { canonicalStoryPath, normalizeStoryDocumentPath } from "./path.js";

type JsonObject = Record<string, unknown>;

const PROJECT_CONFIG_PATH = "story/.novel-claw/project.json";

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const replaceableStoryKeys = (keys: readonly string[], definition: StoryTypeDefinition) => {
  const root = `${canonicalStoryPath(definition.rootPath)}/`;
  return keys.filter(
    (key) =>
      key.startsWith(root) &&
      !key.startsWith(`${root}.novel-claw/`) &&
      !key.startsWith(`${root}runtime/`) &&
      key !== `${root}tavern.json` &&
      (key.endsWith(".json") || key.endsWith(".md")),
  );
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

const loadDefinition = async (backend: StoryProjectRecordBackend, projectKey: string) => {
  const entry = (await backend.list(projectKey)).find(
    (candidate) => canonicalStoryPath(candidate.key) === PROJECT_CONFIG_PATH,
  );
  if (!entry) return null;
  const record = await backend.read(projectKey, entry.key);
  try {
    if (record.contentType !== "json") throw new Error("故事项目定义必须是 JSON 记录。");
    return parseStoryTypeDefinition(record.value);
  } catch (error) {
    throw new Error(`故事项目定义无效：${error instanceof Error ? error.message : String(error)}`);
  }
};

const inspect = async (backend: StoryProjectRecordBackend, projectKey: string, definition: StoryTypeDefinition) => {
  const keys = (await backend.list(projectKey)).map((entry) => canonicalStoryPath(entry.key));
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const replaceablePaths = replaceableStoryKeys(keys, definition);
  return {
    initialized: keys.includes(manifestPath),
    replaceablePaths,
    existingJsonPaths: replaceablePaths.filter((path) => path.endsWith(".json")),
  };
};

const loadProject = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
): Promise<StoryProjectState> => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const manifestRecord = await backend.read(projectKey, manifestPath);
  const manifestValue = parseStoryDocument(
    definition,
    storedDocumentValue(definition, manifestPath, manifestRecord),
    manifestPath,
  );
  if (!isObject(manifestValue)) throw new Error("故事 Manifest 必须是 JSON 对象。");
  const entries = await Promise.all(
    manifestFiles(manifestValue).map(async ({ path }) => {
      const record = await backend.read(projectKey, path);
      return { path, value: storedDocumentValue(definition, path, record) };
    }),
  );
  const project = assembleProject([{ path: manifestPath, value: manifestValue }, ...entries], definition, manifestPath);
  const validation = validateProject(project, definition, "draft");
  if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
  return project;
};

const loadDocument = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  path: string,
): Promise<Pick<StoryDocument, "path" | "value" | "updatedAt">> => {
  const record = await backend.read(projectKey, path);
  return {
    path,
    value: parseStoryDocument(
      definition,
      storedDocumentValue(definition, path, record),
      path,
    ) as StoryDocument["value"],
    updatedAt: record.updatedAt,
  };
};

const initializeProject = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  project: StoryProjectState,
  replacePaths: readonly string[],
) => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const writes: StoryProjectRecordWrite[] = [
    { key: PROJECT_CONFIG_PATH, contentType: "json", value: definition as unknown as StoryValue },
    ...project.documents.map(({ path, value }) => storedDocument(definition, path, value)),
    storedDocument(definition, manifestPath, project.manifest),
  ];
  const writeKeys = new Set(writes.map(({ key }) => key));
  await backend.commit(projectKey, {
    revision: { key: manifestPath, expected: null },
    writes,
    deletes: replacePaths.filter((key) => !writeKeys.has(key)),
  });
};

const persistAppliedProject = async (
  backend: StoryProjectRecordBackend,
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
  await backend.commit(projectKey, {
    revision: { key: manifestPath, expected: applied.nextRevision - 1 },
    writes,
    deletes: changed.filter((path) => !files.has(path)),
  });
};

export const createStoryProjectStorage = (backend: StoryProjectRecordBackend): StoryProjectStorage => {
  const storage: StoryProjectStorage = {
    normalizeDocumentPath: normalizeStoryDocumentPath,
    loadDefinition: (projectKey) => loadDefinition(backend, projectKey),
    inspect: (projectKey, definition) => inspect(backend, projectKey, definition),
    loadProject: (projectKey, definition) => loadProject(backend, projectKey, definition),
    loadDocument: (projectKey, definition, path) => loadDocument(backend, projectKey, definition, path),
    initializeProject: (projectKey, definition, project, replacePaths) =>
      initializeProject(backend, projectKey, definition, project, replacePaths),
    persistAppliedProject: (projectKey, definition, applied) =>
      persistAppliedProject(backend, projectKey, definition, applied),
  };
  return Object.freeze(storage);
};
