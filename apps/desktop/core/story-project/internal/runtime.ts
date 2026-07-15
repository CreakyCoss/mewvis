import { ZodError } from "zod";
import {
  resolveStoryTypePath,
  storyTypeDocument,
  storyTypeKindForPath,
  parseStoryTypeDefinition,
} from "../definitions/definition.js";
import type { StoryTypeDefinition } from "../definitions/types.js";
import { listStoryTypes, resolveStoryType } from "../story-types/index.js";
import type {
  StoryProjectAppliedChanges,
  JsonFieldMetadata,
  JsonObjectDefinition,
  StoryChangeResult,
  StoryChangeValidation,
  StoryProjectState,
  StoryDocument,
  StoryDocumentDefinition,
  StoryInitialization,
  StoryOverview,
  StoryValue,
  StoryValidationIssue,
} from "../types.js";
import {
  StoryProjectRevisionConflictError,
  type StoryProjectRecord,
  type StoryProjectRecordWrite,
  type StoryProjectStore,
} from "../storage/index.js";
import type { StoryProjectApi, StoryWorkspace } from "../index.js";
import { applyChangeSet } from "./changes.js";
import { readStoryProjectContext } from "./context.js";
import { describeStoryProject } from "./description.js";
import { parseStoryDocument, serializeStoryDocument } from "./document.js";
import { StoryProjectValidationError } from "./issues.js";
import { assembleProject, initialDocumentInput, manifestFiles, projectInfo, rebuildManifest } from "./project.js";
import { validateProject } from "./validation.js";

type JsonObject = Record<string, unknown>;

const PROJECT_CONFIG_PATH = "story/.novel-claw/project.json";
const DEFAULT_STORY_TYPE_ID = "long-novel";
const STORY_ROOT = "story/";

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stringValue = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const numberValue = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const canonicalPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const zodPath = (owner: string, path: PropertyKey[]) =>
  path.reduce<string>(
    (result, segment) =>
      typeof segment === "number" ? `${result}[${segment}]` : result ? `${result}.${String(segment)}` : String(segment),
    owner,
  );

const errorIssues = (error: unknown, owner = "changeSet", code = "changeset.invalid"): StoryValidationIssue[] => {
  if (error instanceof StoryProjectValidationError) return [...error.issues];
  if (error instanceof StoryProjectRevisionConflictError) {
    return [{ severity: "error", code: "store.revision_conflict", path: error.key, message: error.message }];
  }
  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      severity: "error",
      code: `${code}.${issue.code}`,
      path: zodPath(owner, issue.path),
      message: issue.message,
    }));
  }
  return [
    {
      severity: "error",
      code,
      path: owner,
      message: error instanceof Error ? error.message : String(error),
    },
  ];
};

const ordinaryStoryKeys = (keys: readonly string[]) =>
  keys.filter(
    (key) =>
      key.startsWith(STORY_ROOT) &&
      !key.startsWith("story/.novel-claw/") &&
      !key.startsWith("story/runtime/") &&
      key !== "story/tavern.json" &&
      (key.endsWith(".json") || key.endsWith(".md")),
  );

const normalizeDocumentPath = (input: string) => {
  const path = canonicalPath(input);
  const rooted = path.startsWith(STORY_ROOT) ? path : `${STORY_ROOT}${path}`;
  const segments = rooted.split("/");
  if (
    (!rooted.endsWith(".json") && !rooted.endsWith(".md")) ||
    segments[0] !== "story" ||
    segments.slice(1).some((segment) => !segment || segment === "." || segment === ".." || /[\0<>:"|?*]/.test(segment))
  ) {
    throw new Error("文件路径必须是 story/ 下的安全 .json 或 .md 路径。");
  }
  return rooted;
};

const readDefinition = async (store: StoryProjectStore, projectKey: string) => {
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

const loadProject = async (
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

const persistAppliedProject = async (
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

const createInitialProject = (definition: StoryTypeDefinition, input: { storyId: string; title: string }) => {
  const timestamp = Date.now();
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const manifest = parseStoryDocument(
    definition,
    initialDocumentInput(definition, definition.manifestKind, input.storyId, input.title, timestamp),
    manifestPath,
    timestamp,
  );
  if (!isObject(manifest)) throw new Error("故事 Manifest 必须是 JSON 对象。");
  const documents = definition.documents.flatMap((document) => {
    if (document.kind === definition.manifestKind || document.cardinality !== "one") return [];
    const path = resolveStoryTypePath(definition, document.kind);
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

const persistInitialProject = async (
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

const editableDocument = async (
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

const overview = (project: StoryProjectState, definition: StoryTypeDefinition): StoryOverview => {
  const documents = project.documents;
  const valuesForRole = (role: string) => {
    const kind = definition.roles[role];
    return kind
      ? documents.flatMap((entry) =>
          storyTypeKindForPath(definition, entry.path) === kind && isObject(entry.value) ? [entry.value] : [],
        )
      : [];
  };
  const primary = valuesForRole("primary")[0] ?? {};
  const positioning = valuesForRole("positioning")[0] ?? {};
  const manifest = project.manifest;
  const characters = valuesForRole("character").map((character) => ({
    id: stringValue(character.id),
    name: stringValue(character.name),
    avatar: stringValue(character.avatar, "blank-avatar"),
  }));
  return {
    id: projectInfo(project).storyId,
    title: stringValue(primary.title, stringValue(manifest.title, "未命名故事")),
    description: stringValue(primary.premise),
    goal: stringValue(primary.goal),
    lengthType: stringValue(positioning.lengthType),
    createdAt: numberValue(primary.createdAt, numberValue(manifest.createdAt, Date.now())),
    updatedAt: numberValue(manifest.updatedAt, Date.now()),
    characters,
    resourceCounts: {
      characters: characters.length,
      chapters: valuesForRole("chapterPlan").length,
      worldEntries: valuesForRole("worldEntry").length,
    },
  };
};

const createWorkspace = (
  store: StoryProjectStore,
  projectKey: string,
  options: Readonly<{ fallbackStoryTypeId?: string }> = {},
): StoryWorkspace => {
  const loadDefinition = () => readDefinition(store, projectKey);
  const describeDefinition = async () => {
    const keys = new Set((await store.list(projectKey)).map((entry) => entry.key));
    return keys.has(PROJECT_CONFIG_PATH)
      ? loadDefinition()
      : resolveStoryType(options.fallbackStoryTypeId ?? DEFAULT_STORY_TYPE_ID);
  };
  const workspace: StoryWorkspace = {
    projectKey,

    async initialize(input): Promise<StoryInitialization> {
      try {
        const keys = (await store.list(projectKey)).map((entry) => canonicalPath(entry.key));
        const configured = keys.includes(PROJECT_CONFIG_PATH);
        const definition = configured
          ? await loadDefinition()
          : resolveStoryType(input.storyTypeId ?? options.fallbackStoryTypeId ?? DEFAULT_STORY_TYPE_ID);
        if (input.storyTypeId && input.storyTypeId !== definition.id) {
          throw new Error(`工作区故事类型为 ${definition.id}，不能按 ${input.storyTypeId} 初始化。`);
        }
        const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
        const existingPaths = ordinaryStoryKeys(keys);
        if (keys.includes(manifestPath)) {
          const current = await loadProject(store, projectKey, definition);
          return {
            initialized: false,
            alreadyInitialized: true,
            revision: projectInfo(current).revision,
            manifestPath,
            existingJsonPaths: existingPaths.filter((path) => path.endsWith(".json")),
            issues: [],
            hint: "故事项目已经初始化，请先读取上下文再增量提交。",
          };
        }
        if (existingPaths.length > 0 && !input.replaceExistingJson) {
          return {
            initialized: false,
            alreadyInitialized: false,
            revision: null,
            manifestPath,
            existingJsonPaths: existingPaths.filter((path) => path.endsWith(".json")),
            issues: [
              {
                severity: "error",
                code: "initialize.existing-files",
                path: definition.rootPath,
                message: `${definition.rootPath} 目录已有不受当前故事类型管理的文件；明确允许替换后才能初始化。`,
              },
            ],
            hint: "确认现有故事文件可以被替换后，将 replaceExistingJson 设为 true 重试。",
          };
        }
        const project = createInitialProject(definition, input);
        const validation = validateProject(project, definition, "draft");
        if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
        await persistInitialProject(
          store,
          projectKey,
          definition,
          project,
          input.replaceExistingJson ? existingPaths : [],
        );
        return {
          initialized: true,
          alreadyInitialized: false,
          revision: projectInfo(project).revision,
          manifestPath,
          existingJsonPaths: existingPaths.filter((path) => path.endsWith(".json")),
          issues: validation.issues,
          hint: null,
        };
      } catch (error) {
        return {
          initialized: false,
          alreadyInitialized: false,
          revision: null,
          manifestPath: null,
          existingJsonPaths: [],
          issues: errorIssues(error, "initialize", "initialize.invalid"),
          hint: "未创建任何正式故事文件。请修正故事类型或初始化参数后重试。",
        };
      }
    },

    async describe(input = {}) {
      return describeStoryProject(await describeDefinition(), input);
    },

    async overview() {
      const definition = await loadDefinition();
      return overview(await loadProject(store, projectKey, definition), definition);
    },

    async listDocuments(input = {}) {
      const definition = await loadDefinition();
      const project = await loadProject(store, projectKey, definition);
      const kind = input.role ? definition.roles[input.role] : undefined;
      if (input.role && !kind) throw new Error(`当前故事类型没有提供 ${input.role} 文档角色。`);
      const paths = project.documents
        .filter((entry) => !kind || storyTypeKindForPath(definition, entry.path) === kind)
        .map((entry) => entry.path)
        .sort((left, right) => left.localeCompare(right));
      return Promise.all(paths.map((path) => editableDocument(store, projectKey, definition, path)));
    },

    async saveDocument(document) {
      const definition = await loadDefinition();
      const path = normalizeDocumentPath(document.path);
      storyTypeKindForPath(definition, path);
      const project = await loadProject(store, projectKey, definition);
      const info = projectInfo(project);
      const applied = applyChangeSet(
        project,
        {
          storyTypeId: definition.id,
          storyTypeVersion: definition.version,
          storyId: info.storyId,
          baseRevision: info.revision,
          validationMode: "draft",
          operations: [{ type: "upsert", path, value: document.value }],
        },
        definition,
      );
      await persistAppliedProject(store, projectKey, definition, applied);
      return editableDocument(store, projectKey, definition, path);
    },

    async removeDocument(inputPath) {
      const definition = await loadDefinition();
      const path = normalizeDocumentPath(inputPath);
      const kind = storyTypeKindForPath(definition, path);
      const document = storyTypeDocument(definition, kind);
      if (document.cardinality === "one") throw new Error(`「${document.label}」必须保留一份，不能删除。`);
      const project = await loadProject(store, projectKey, definition);
      const current = project.documents.find((entry) => entry.path === path)?.value;
      const id = isObject(current) && typeof current.id === "string" ? current.id : "";
      const companionPaths = id
        ? (document.companionKinds ?? []).flatMap((companionKind) => {
            const companion = storyTypeDocument(definition, companionKind);
            if (companion.cardinality !== "many") return [];
            try {
              return [resolveStoryTypePath(definition, companionKind, { id, characterId: id })];
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
          operations: [...new Set([path, ...companionPaths])]
            .filter((targetPath) => project.documents.some((entry) => entry.path === targetPath))
            .map((targetPath) => ({ type: "delete", path: targetPath })),
        },
        definition,
      );
      await persistAppliedProject(store, projectKey, definition, applied);
    },

    normalizeDocumentPath,

    async readContext(input) {
      const definition = await loadDefinition();
      return readStoryProjectContext(await loadProject(store, projectKey, definition), definition, input);
    },

    async validateChanges(changeSet): Promise<StoryChangeValidation> {
      try {
        const definition = await loadDefinition();
        const applied = applyChangeSet(await loadProject(store, projectKey, definition), changeSet, definition);
        return {
          valid: applied.validation.valid,
          nextRevision: applied.nextRevision,
          issues: applied.validation.issues,
          batch: applied.batch,
          operationTypes: applied.operationTypes,
          changedPaths: applied.changedPaths,
        };
      } catch (error) {
        return {
          valid: false,
          nextRevision: null,
          issues: errorIssues(error),
          batch: null,
          operationTypes: [],
          changedPaths: [],
        };
      }
    },

    async commitChanges(changeSet): Promise<StoryChangeResult> {
      try {
        const definition = await loadDefinition();
        const applied = applyChangeSet(await loadProject(store, projectKey, definition), changeSet, definition);
        await persistAppliedProject(store, projectKey, definition, applied);
        return {
          committed: true,
          valid: true,
          revision: applied.nextRevision,
          batch: applied.batch,
          operationTypes: applied.operationTypes,
          changedPaths: applied.changedPaths,
          validation: applied.validation,
          issues: applied.validation.issues,
          hint: null,
        };
      } catch (error) {
        return {
          committed: false,
          valid: false,
          revision: null,
          batch: null,
          operationTypes: [],
          changedPaths: [],
          validation: null,
          issues: errorIssues(error),
          hint: "正式文件未修改。请读取最新 revision，并只修正当前小批次后重新提交。",
        };
      }
    },
  };
  return Object.freeze(workspace);
};

export const buildStoryProjectApi = (store: StoryProjectStore): StoryProjectApi => {
  const client: StoryProjectApi = {
    listStoryTypes,
    workspace: (projectKey: string) => createWorkspace(store, projectKey),
    async open(projectKey: string) {
      await readDefinition(store, projectKey);
      return createWorkspace(store, projectKey);
    },
    async create(projectKey, input) {
      const workspace = createWorkspace(store, projectKey, { fallbackStoryTypeId: input.storyTypeId });
      const result = await workspace.initialize({ ...input, storyTypeId: input.storyTypeId });
      if (!result.initialized && !result.alreadyInitialized) {
        throw new StoryProjectValidationError(result.issues);
      }
      return workspace;
    },
  };
  return Object.freeze(client);
};
