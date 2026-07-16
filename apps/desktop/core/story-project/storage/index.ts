import { StoryDefinition } from "../definitions/index.js";
import type { StoryDocumentIdentity } from "../definitions/model/types.js";
import type { StoryTypeDefinition } from "../definitions/types.js";
import type {
  StoryChangeSetDescription,
  StoryDocument,
  StoryProjectAppliedChanges,
  StoryProjectState,
  StoryValue,
} from "../types.js";
import { StoryProjectValidationError } from "../errors.js";
import { createStoryFileRecordBackend } from "./adapters/file/index.js";
import { assertStoryFileLayout } from "./adapters/file/layout.js";
import { createMemoryStoryProjectRecordBackend } from "./adapters/memory/index.js";
import type { StoryProjectRecord, StoryProjectRecordBackend, StoryProjectRecordWrite } from "./adapters/record.js";
import { applyChangeSet, STORY_CHANGE_SET_DESCRIPTION } from "./internal/changes.js";
import { serializeStoryDocument } from "./internal/codec.js";
import { assembleProject, createInitialProject, projectInfo } from "./internal/project.js";
import { validateProject } from "./internal/validation.js";
import type { StoryProjectInventory, StoryProjectStorageOptions } from "./types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Story Project 的领域级持久化边界；调用方只使用文档身份，不感知 Adapter 的物理定位。 */
export interface StoryProjectStorage {
  readonly changeSet: StoryChangeSetDescription;
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
    input: Readonly<{ storyId: string; title: string }>,
    replaceKeys: readonly string[],
  ): Promise<StoryProjectState>;
  saveDocument(
    projectKey: string,
    definition: StoryTypeDefinition,
    document: Pick<StoryDocument, "ref" | "value">,
  ): Promise<Pick<StoryDocument, "ref" | "value" | "updatedAt">>;
  removeDocument(projectKey: string, definition: StoryTypeDefinition, identity: StoryDocumentIdentity): Promise<void>;
  validateChanges(
    projectKey: string,
    definition: StoryTypeDefinition,
    changeSet: unknown,
  ): Promise<StoryProjectAppliedChanges>;
  commitChanges(
    projectKey: string,
    definition: StoryTypeDefinition,
    changeSet: unknown,
  ): Promise<StoryProjectAppliedChanges>;
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
  const manifestValue = StoryDefinition.parseDocument(
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
    value: StoryDefinition.parseDocument(
      definition,
      storedDocumentValue(definition, ref, record),
      ref,
    ) as StoryDocument["value"],
    updatedAt: record.updatedAt,
  };
};

const persistInitialProject = async (
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

const initializeProject = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  input: Readonly<{ storyId: string; title: string }>,
  replaceKeys: readonly string[],
) => {
  const project = createInitialProject(definition, input);
  const validation = validateProject(project, definition, "draft");
  if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
  await persistInitialProject(backend, projectKey, definition, project, replaceKeys);
  return project;
};

const saveDocument = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  document: Pick<StoryDocument, "ref" | "value">,
) => {
  const ref = StoryDefinition.identity(definition, document.ref.kind, document.ref.identity);
  const project = await loadProject(backend, projectKey, definition);
  const info = projectInfo(project);
  const applied = applyChangeSet(
    project,
    {
      storyTypeId: definition.id,
      storyTypeVersion: definition.version,
      storyId: info.storyId,
      baseRevision: info.revision,
      validationMode: "draft",
      operations: [{ type: "upsert", ref, value: document.value }],
    },
    definition,
  );
  await persistAppliedProject(backend, projectKey, definition, applied);
  return loadDocument(backend, projectKey, definition, ref);
};

const removeDocument = async (
  backend: StoryProjectRecordBackend,
  projectKey: string,
  definition: StoryTypeDefinition,
  inputIdentity: StoryDocumentIdentity,
) => {
  const identity = StoryDefinition.identity(definition, inputIdentity.kind, inputIdentity.identity);
  const document = StoryDefinition.document(definition, identity.kind);
  if (document.cardinality === "one") throw new Error(`「${document.label}」必须保留一份，不能删除。`);
  const project = await loadProject(backend, projectKey, definition);
  const identityKey = StoryDefinition.identityKey(identity);
  const current = project.documents.find((entry) => StoryDefinition.identityKey(entry.ref) === identityKey)?.value;
  const id = isObject(current) && typeof current.id === "string" ? current.id : "";
  const companionIdentities: StoryDocumentIdentity[] = id
    ? (document.companionKinds ?? []).flatMap((companionKind) => {
        const companion = StoryDefinition.document(definition, companionKind);
        if (companion.cardinality !== "many") return [];
        try {
          return [
            StoryDefinition.identity(
              definition,
              companionKind,
              Object.fromEntries(
                companion.identityFields.map((field) => [
                  field,
                  isObject(current) && typeof current[field] === "string" ? current[field] : id,
                ]),
              ),
            ),
          ];
        } catch {
          return [];
        }
      })
    : [];
  const info = projectInfo(project);
  const applied = applyChangeSet(
    project,
    {
      storyTypeId: definition.id,
      storyTypeVersion: definition.version,
      storyId: info.storyId,
      baseRevision: info.revision,
      validationMode: "draft",
      operations: [identity, ...companionIdentities]
        .filter(
          (target, index, identities) =>
            identities.findIndex(
              (candidate) => StoryDefinition.identityKey(candidate) === StoryDefinition.identityKey(target),
            ) === index,
        )
        .filter((target) =>
          project.documents.some(
            (entry) => StoryDefinition.identityKey(entry.ref) === StoryDefinition.identityKey(target),
          ),
        )
        .map((target) => ({ type: "delete" as const, ref: target })),
    },
    definition,
  );
  await persistAppliedProject(backend, projectKey, definition, applied);
};

/** 根据 Storage 类型分发具体 Adapter，并返回统一的领域级 Storage。 */
export const createStoryProjectStorage = (options: StoryProjectStorageOptions): StoryProjectStorage => {
  const backend =
    options.kind === "file" ? createStoryFileRecordBackend(options) : createMemoryStoryProjectRecordBackend();
  const assertDefinition = (definition: StoryTypeDefinition) => {
    if (options.kind === "file") assertStoryFileLayout(options.layout, definition);
  };
  const storage: StoryProjectStorage = {
    changeSet: STORY_CHANGE_SET_DESCRIPTION,
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
    initializeProject(projectKey, definition, input, replaceKeys) {
      assertDefinition(definition);
      return initializeProject(backend, projectKey, definition, input, replaceKeys);
    },
    saveDocument(projectKey, definition, document) {
      assertDefinition(definition);
      return saveDocument(backend, projectKey, definition, document);
    },
    removeDocument(projectKey, definition, identity) {
      assertDefinition(definition);
      return removeDocument(backend, projectKey, definition, identity);
    },
    async validateChanges(projectKey, definition, changeSet) {
      assertDefinition(definition);
      return applyChangeSet(await loadProject(backend, projectKey, definition), changeSet, definition);
    },
    async commitChanges(projectKey, definition, changeSet) {
      assertDefinition(definition);
      const applied = applyChangeSet(await loadProject(backend, projectKey, definition), changeSet, definition);
      await persistAppliedProject(backend, projectKey, definition, applied);
      return applied;
    },
  };
  return Object.freeze(storage);
};
