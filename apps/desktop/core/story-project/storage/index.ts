import { StoryDefinition } from "../definitions/index.js";
import type { StoryDocumentIdentity } from "../definitions/model/types.js";
import type { StoryTypeDefinition } from "../definitions/types.js";
import type { StoryDocument, StoryProjectAppliedChanges, StoryProjectState, StoryValue } from "../types.js";
import { parseStoryDocument, serializeStoryDocument } from "../internal/engine/document.js";
import { StoryProjectValidationError } from "../internal/engine/issues.js";
import { assembleProject } from "../internal/engine/project.js";
import { validateProject } from "../internal/engine/validation.js";
import { createStoryFileRecordBackend } from "./adapters/file/index.js";
import { assertStoryFileLayout } from "./adapters/file/layout.js";
import { createMemoryStoryProjectRecordBackend } from "./adapters/memory/index.js";
import type { StoryProjectRecord, StoryProjectRecordBackend, StoryProjectRecordWrite } from "./adapters/record.js";
import type { StoryProjectInventory, StoryProjectStorageOptions } from "./types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Story Project 的领域级持久化边界；调用方只使用文档身份，不感知 Adapter 的物理定位。 */
export interface StoryProjectStorage {
  loadDefinition(projectKey: string): Promise<StoryTypeDefinition | null>;
  inspect(projectKey: string, definition: StoryTypeDefinition): Promise<StoryProjectInventory>;
  loadProject(projectKey: string, definition: StoryTypeDefinition): Promise<StoryProjectState>;
  loadDocument(
    projectKey: string,
    definition: StoryTypeDefinition,
    ref: StoryDocumentIdentity,
  ): Promise<Pick<StoryDocument, "ref" | "value" | "updatedAt">>;
  initializeProject(
    projectKey: string,
    definition: StoryTypeDefinition,
    project: StoryProjectState,
    replaceKeys: readonly string[],
  ): Promise<void>;
  persistAppliedProject(
    projectKey: string,
    definition: StoryTypeDefinition,
    applied: StoryProjectAppliedChanges,
  ): Promise<void>;
}

const storedDocument = (
  backend: StoryProjectRecordBackend,
  definition: StoryTypeDefinition,
  inputRef: StoryDocumentIdentity,
  value: unknown,
): StoryProjectRecordWrite => {
  const ref = StoryDefinition.identity(definition, inputRef.kind, inputRef.identity);
  const serialized = serializeStoryDocument(definition, value, ref);
  const key = backend.documentKey(ref);
  return typeof serialized === "string"
    ? { key, contentFormat: "markdown", value: serialized }
    : { key, contentFormat: "structured", value: serialized as StoryValue };
};

const storedDocumentValue = (
  definition: StoryTypeDefinition,
  ref: StoryDocumentIdentity,
  record: StoryProjectRecord,
) => {
  const expected = StoryDefinition.document(definition, ref.kind).contentFormat;
  if (record.contentFormat !== expected) {
    throw new Error(
      `故事记录格式不一致：${StoryDefinition.identityKey(ref)} 期望 ${expected}，实际为 ${record.contentFormat}。`,
    );
  }
  return record.value;
};

const loadDefinition = async (backend: StoryProjectRecordBackend, projectKey: string) => {
  const record = await backend.readOptional(projectKey, backend.definitionKey);
  if (!record) return null;
  try {
    if (record.contentFormat !== "structured") throw new Error("故事项目定义必须是结构化记录。");
    return StoryDefinition.parse(record.value);
  } catch (error) {
    throw new Error(`故事项目定义无效：${error instanceof Error ? error.message : String(error)}`);
  }
};

const inspect = async (backend: StoryProjectRecordBackend, projectKey: string, definition: StoryTypeDefinition) => {
  const keys = (await backend.list(projectKey)).map((entry) => entry.key);
  const manifestRef = StoryDefinition.identity(definition, definition.manifestKind);
  const replaceableKeys = [...backend.replaceableKeys(keys)];
  return {
    initialized: keys.includes(backend.documentKey(manifestRef)),
    replaceableKeys,
  };
};

const loadProject = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
): Promise<StoryProjectState> => {
  const manifestRef = StoryDefinition.identity(definition, definition.manifestKind);
  const manifestRecord = await backend.read(projectKey, backend.documentKey(manifestRef));
  const manifestValue = parseStoryDocument(
    definition,
    storedDocumentValue(definition, manifestRef, manifestRecord),
    manifestRef,
  );
  if (!isObject(manifestValue)) throw new Error("故事 Manifest 必须是结构化对象。");
  const refs = (await backend.list(projectKey)).flatMap((entry) => {
    const ref = backend.documentIdentity(entry.key);
    return ref && ref.kind !== definition.manifestKind ? [ref] : [];
  });
  const entries = await Promise.all(
    refs.map(async (ref) => {
      const record = await backend.read(projectKey, backend.documentKey(ref));
      return { ref, value: storedDocumentValue(definition, ref, record) };
    }),
  );
  const project = assembleProject([{ ref: manifestRef, value: manifestValue }, ...entries], definition);
  const validation = validateProject(project, definition, "draft");
  if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
  return project;
};

const loadDocument = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  inputRef: StoryDocumentIdentity,
): Promise<Pick<StoryDocument, "ref" | "value" | "updatedAt">> => {
  const ref = StoryDefinition.identity(definition, inputRef.kind, inputRef.identity);
  const record = await backend.read(projectKey, backend.documentKey(ref));
  return {
    ref,
    value: parseStoryDocument(definition, storedDocumentValue(definition, ref, record), ref) as StoryDocument["value"],
    updatedAt: record.updatedAt,
  };
};

const initializeProject = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  project: StoryProjectState,
  replaceKeys: readonly string[],
) => {
  const manifestRef = StoryDefinition.identity(definition, definition.manifestKind);
  const writes: StoryProjectRecordWrite[] = [
    { key: backend.definitionKey, contentFormat: "structured", value: definition as unknown as StoryValue },
    ...project.documents.map(({ ref, value }) => storedDocument(backend, definition, ref, value)),
    storedDocument(backend, definition, manifestRef, project.manifest),
  ];
  const writeKeys = new Set(writes.map(({ key }) => key));
  await backend.commit(projectKey, {
    revision: { key: backend.documentKey(manifestRef), expected: null },
    writes,
    deletes: replaceKeys.filter((key) => !writeKeys.has(key)),
  });
};

const persistAppliedProject = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  applied: StoryProjectAppliedChanges,
) => {
  const manifestRef = StoryDefinition.identity(definition, definition.manifestKind);
  const documents = new Map(applied.project.documents.map((entry) => [StoryDefinition.identityKey(entry.ref), entry]));
  const changed = new Map(applied.changedDocuments.map((ref) => [StoryDefinition.identityKey(ref), ref]));
  const writes: StoryProjectRecordWrite[] = [...changed].flatMap(([key, ref]) => {
    const document = documents.get(key);
    return document ? [storedDocument(backend, definition, ref, document.value)] : [];
  });
  writes.push(storedDocument(backend, definition, manifestRef, applied.project.manifest));
  await backend.commit(projectKey, {
    revision: { key: backend.documentKey(manifestRef), expected: applied.nextRevision - 1 },
    writes,
    deletes: [...changed.values()]
      .filter((ref) => !documents.has(StoryDefinition.identityKey(ref)))
      .map((ref) => backend.documentKey(ref)),
  });
};

/** 根据 Storage 类型分发具体 Adapter，并返回统一的领域级 Storage。 */
export const createStoryProjectStorage = (options: StoryProjectStorageOptions): StoryProjectStorage => {
  const backend =
    options.kind === "file" ? createStoryFileRecordBackend(options) : createMemoryStoryProjectRecordBackend();
  const assertDefinition = (definition: StoryTypeDefinition) => {
    if (options.kind === "file") assertStoryFileLayout(options.layout, definition);
  };
  const storage: StoryProjectStorage = {
    async loadDefinition(projectKey) {
      const definition = await loadDefinition(backend, projectKey);
      if (definition) assertDefinition(definition);
      return definition;
    },
    inspect(projectKey, definition) {
      assertDefinition(definition);
      return inspect(backend, projectKey, definition);
    },
    loadProject(projectKey, definition) {
      assertDefinition(definition);
      return loadProject(backend, projectKey, definition);
    },
    loadDocument(projectKey, definition, ref) {
      assertDefinition(definition);
      return loadDocument(backend, projectKey, definition, ref);
    },
    initializeProject(projectKey, definition, project, replaceKeys) {
      assertDefinition(definition);
      return initializeProject(backend, projectKey, definition, project, replaceKeys);
    },
    persistAppliedProject(projectKey, definition, applied) {
      assertDefinition(definition);
      return persistAppliedProject(backend, projectKey, definition, applied);
    },
  };
  return Object.freeze(storage);
};
