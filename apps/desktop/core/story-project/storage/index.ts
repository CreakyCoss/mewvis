import { StoryDefinition } from "../definitions/index.js";
import type { StoryDocumentIdentity } from "../definitions/model/types.js";
import type { StoryTypeDefinition } from "../definitions/types.js";
import type {
  StoryChangeSetDescription,
  StoryDocument,
  StoryProjectAppliedChanges,
  StoryProjectCompatibility,
  StoryProjectState,
  StoryProjectUpgradeResult,
  StoryProjectVersion,
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
import type { StoryFileStorageBinding, StoryProjectInventory, StoryProjectStorageOptions } from "./types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Story Project 的领域级持久化边界；调用方只使用文档身份，不感知 Adapter 的物理定位。 */
export interface StoryProjectStorage {
  readonly changeSet: StoryChangeSetDescription;
  checkCompatibility(projectKey: string): Promise<StoryProjectCompatibility>;
  upgradeProject(projectKey: string): Promise<StoryProjectUpgradeResult>;
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

const definitionVersion = (definition: StoryTypeDefinition): StoryProjectVersion => ({
  format: definition.$format,
  formatVersion: definition.formatVersion,
  storyTypeId: definition.id,
  storyTypeVersion: definition.version,
});

const storedDefinitionVersion = (record: StoryProjectRecord): StoryProjectVersion => {
  if (record.contentFormat !== "structured" || !isObject(record.value)) {
    throw new Error("故事项目定义必须是结构化记录。");
  }
  const value = record.value;
  if (typeof value.$format !== "string" || !value.$format.trim()) {
    throw new Error("故事项目定义缺少 $format。");
  }
  if (!Number.isInteger(value.formatVersion) || Number(value.formatVersion) <= 0) {
    throw new Error("故事项目定义缺少有效的 formatVersion。");
  }
  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new Error("故事项目定义缺少故事类型 ID。");
  }
  if (!Number.isInteger(value.version) || Number(value.version) <= 0) {
    throw new Error("故事项目定义缺少有效的故事类型版本。");
  }
  return {
    format: value.$format.trim(),
    formatVersion: Number(value.formatVersion),
    storyTypeId: value.id.trim(),
    storyTypeVersion: Number(value.version),
  };
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const incompatibleProject = (
  reason: string,
  current: StoryProjectVersion | null = null,
  target: StoryProjectVersion | null = null,
): StoryProjectCompatibility => ({ status: "incompatible", current, target, reason });

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
  const bindingKey = (definition: Pick<StoryTypeDefinition, "id" | "version">) =>
    `${definition.id}@${definition.version}`;
  const fileBindings = new Map<string, StoryFileStorageBinding>();
  const fileBindingsById = new Map<string, StoryFileStorageBinding>();
  const fileBackends = new Map<string, StoryProjectRecordBackend>();
  const definitions =
    options.kind === "file" ? options.bindings.map(({ definition }) => definition) : (options.definitions ?? []);
  const definitionsById = new Map<string, StoryTypeDefinition>();

  for (const definition of definitions) {
    if (definitionsById.has(definition.id)) throw new Error(`Storage 重复配置 Story Type：${definition.id}`);
    definitionsById.set(definition.id, definition);
  }

  if (options.kind === "file") {
    if (options.bindings.length === 0) throw new Error("File Storage 至少需要绑定一个 Story Type。");
    const definitionPaths = new Set(options.bindings.map(({ layout }) => layout.definitionPath));
    if (definitionPaths.size !== 1) throw new Error("File Storage 的 Story Type 必须使用相同的定义文件路径。");
    for (const binding of options.bindings) {
      const key = bindingKey(binding.definition);
      if (fileBindings.has(key)) throw new Error(`File Storage 重复绑定 Story Type：${key}`);
      assertStoryFileLayout(binding.layout, binding.definition);
      fileBindings.set(key, binding);
      fileBindingsById.set(binding.definition.id, binding);
    }
  }

  const memoryBackend = options.kind === "memory" ? createMemoryStoryProjectRecordBackend() : null;
  const fileBackend = (binding: StoryFileStorageBinding) => {
    const key = bindingKey(binding.definition);
    const current = fileBackends.get(key);
    if (current) return current;
    if (options.kind !== "file") throw new Error("当前 Storage 不是文件存储。");
    const created = createStoryFileRecordBackend(options.backend, binding.layout);
    fileBackends.set(key, created);
    return created;
  };
  const backendForDefinition = (definition: StoryTypeDefinition) => {
    if (memoryBackend) return memoryBackend;
    const key = bindingKey(definition);
    const binding = fileBindings.get(key);
    if (!binding) throw new Error(`File Storage 未绑定 Story Type：${key}`);
    assertStoryFileLayout(binding.layout, definition);
    return fileBackend(binding);
  };
  const definitionBackend = memoryBackend ?? fileBackend(fileBindings.values().next().value as StoryFileStorageBinding);

  const targetBackend = (definition: StoryTypeDefinition) => {
    if (memoryBackend) return memoryBackend;
    const binding = fileBindingsById.get(definition.id);
    if (!binding) throw new Error(`File Storage 未配置 Story Type：${definition.id}`);
    return fileBackend(binding);
  };

  const checkCompatibility = async (projectKey: string): Promise<StoryProjectCompatibility> => {
    let record: StoryProjectRecord | null;
    try {
      record = await definitionBackend.readOptional(projectKey, definitionBackend.definitionKey);
    } catch (error) {
      return incompatibleProject(`无法读取故事项目定义：${errorMessage(error)}`);
    }
    if (!record) return incompatibleProject("故事工作区缺少项目定义文件。");

    let current: StoryProjectVersion;
    try {
      current = storedDefinitionVersion(record);
    } catch (error) {
      return incompatibleProject(errorMessage(error));
    }
    const targetDefinition = definitionsById.get(current.storyTypeId);
    if (!targetDefinition) return incompatibleProject(`当前应用不支持故事类型：${current.storyTypeId}`, current);
    const target = definitionVersion(targetDefinition);
    if (current.format !== target.format) {
      return incompatibleProject(`项目格式 ${current.format} 不能升级为 ${target.format}。`, current, target);
    }
    if (current.formatVersion > target.formatVersion || current.storyTypeVersion > target.storyTypeVersion) {
      return incompatibleProject("项目版本高于当前应用支持的版本，请升级应用后再打开。", current, target);
    }

    try {
      await loadProject(targetBackend(targetDefinition), projectKey, targetDefinition);
    } catch (error) {
      return incompatibleProject(`项目文档无法兼容升级：${errorMessage(error)}`, current, target);
    }

    const needsUpgrade =
      current.formatVersion !== target.formatVersion || current.storyTypeVersion !== target.storyTypeVersion;
    if (needsUpgrade) return { status: "upgrade-available", current, target, reason: null };
    try {
      StoryDefinition.parse(record.value);
    } catch (error) {
      return incompatibleProject(`项目定义无效：${errorMessage(error)}`, current, target);
    }
    return { status: "compatible", current, target, reason: null };
  };

  const storage: StoryProjectStorage = {
    changeSet: STORY_CHANGE_SET_DESCRIPTION,
    checkCompatibility,
    async upgradeProject(projectKey) {
      const compatibility = await checkCompatibility(projectKey);
      if (compatibility.status !== "upgrade-available" || !compatibility.target) {
        return { upgraded: false, compatibility };
      }
      const definition = definitionsById.get(compatibility.target.storyTypeId);
      if (!definition) return { upgraded: false, compatibility };
      const backend = targetBackend(definition);
      const project = await loadProject(backend, projectKey, definition);
      const manifestRef = StoryDefinition.identity(definition, definition.manifestKind);
      await backend.commit(projectKey, {
        revision: { key: backend.documentKey(manifestRef), expected: projectInfo(project).revision },
        writes: [
          {
            key: backend.definitionKey,
            contentFormat: "structured",
            value: definition as unknown as StoryValue,
          },
        ],
        deletes: [],
      });
      return { upgraded: true, compatibility: await checkCompatibility(projectKey) };
    },
    async loadDefinition(projectKey) {
      const definition = await loadDefinition(definitionBackend, projectKey);
      if (definition) backendForDefinition(definition);
      return definition;
    },
    inspect(projectKey, definition) {
      return inspect(backendForDefinition(definition), projectKey, definition);
    },
    loadProject(projectKey, definition) {
      return loadProject(backendForDefinition(definition), projectKey, definition);
    },
    loadDocument(projectKey, definition, ref) {
      return loadDocument(backendForDefinition(definition), projectKey, definition, ref);
    },
    initializeProject(projectKey, definition, input, replaceKeys) {
      return initializeProject(backendForDefinition(definition), projectKey, definition, input, replaceKeys);
    },
    saveDocument(projectKey, definition, document) {
      return saveDocument(backendForDefinition(definition), projectKey, definition, document);
    },
    removeDocument(projectKey, definition, identity) {
      return removeDocument(backendForDefinition(definition), projectKey, definition, identity);
    },
    async validateChanges(projectKey, definition, changeSet) {
      const backend = backendForDefinition(definition);
      return applyChangeSet(await loadProject(backend, projectKey, definition), changeSet, definition);
    },
    async commitChanges(projectKey, definition, changeSet) {
      const backend = backendForDefinition(definition);
      const applied = applyChangeSet(await loadProject(backend, projectKey, definition), changeSet, definition);
      await persistAppliedProject(backend, projectKey, definition, applied);
      return applied;
    },
  };
  return Object.freeze(storage);
};
