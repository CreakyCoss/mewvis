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
  StoryStorage,
  StoryValidationIssue,
} from "../types.js";
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

const serializedContent = (value: Record<string, unknown> | string) =>
  typeof value === "string" ? `${value.replace(/\s+$/, "")}\n` : `${JSON.stringify(value, null, 2)}\n`;

const parseStoredContent = (path: string, content: string) => {
  if (path.endsWith(".md")) return content;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`故事 JSON 无法解析：${path}`);
  }
};

const zodPath = (owner: string, path: PropertyKey[]) =>
  path.reduce<string>(
    (result, segment) =>
      typeof segment === "number" ? `${result}[${segment}]` : result ? `${result}.${String(segment)}` : String(segment),
    owner,
  );

const errorIssues = (error: unknown, owner = "changeSet", code = "changeset.invalid"): StoryValidationIssue[] => {
  if (error instanceof StoryProjectValidationError) return [...error.issues];
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

const ordinaryStoryPaths = (paths: readonly string[]) =>
  paths.filter(
    (path) =>
      path.startsWith(STORY_ROOT) &&
      !path.startsWith("story/.novel-claw/") &&
      !path.startsWith("story/runtime/") &&
      path !== "story/tavern.json" &&
      (path.endsWith(".json") || path.endsWith(".md")),
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

const definitionText = (definition: StoryTypeDefinition) => `${JSON.stringify(definition, null, 2)}\n`;

const readDefinition = async (storage: StoryStorage, workspacePath: string) => {
  const file = await storage.read(workspacePath, PROJECT_CONFIG_PATH);
  try {
    return parseStoryTypeDefinition(JSON.parse(file.content) as unknown);
  } catch (error) {
    throw new Error(`故事项目定义无效：${error instanceof Error ? error.message : String(error)}`);
  }
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
  storage: StoryStorage,
  workspacePath: string,
  definition: StoryTypeDefinition,
): Promise<StoryProjectState> => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const manifestFile = await storage.read(workspacePath, manifestPath);
  const manifestValue = parseStoryDocument(
    definition,
    parseStoredContent(manifestPath, manifestFile.content),
    manifestPath,
  );
  if (!isObject(manifestValue)) throw new Error("故事 Manifest 必须是 JSON 对象。");
  const entries = await Promise.all(
    manifestFiles(manifestValue).map(async ({ path }) => {
      const file = await storage.read(workspacePath, path);
      return { path, value: parseStoredContent(path, file.content) };
    }),
  );
  const project = assembleProject([{ path: manifestPath, value: manifestValue }, ...entries], definition, manifestPath);
  const validation = validateProject(project, definition, "draft");
  if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
  return project;
};

const persistAppliedProject = async (
  storage: StoryStorage,
  workspacePath: string,
  definition: StoryTypeDefinition,
  applied: StoryProjectAppliedChanges,
) => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const files = new Map(applied.project.documents.map((entry) => [entry.path, entry.value]));
  const changed = [...new Set(applied.changedPaths)];
  const writes = changed.flatMap((path) => {
    const value = files.get(path);
    return value === undefined
      ? []
      : [{ path, content: serializedContent(serializeStoryDocument(definition, value, path)) }];
  });
  writes.push({
    path: manifestPath,
    content: serializedContent(serializeStoryDocument(definition, applied.project.manifest, manifestPath)),
  });
  await storage.writeAtomic(
    workspacePath,
    writes,
    changed.filter((path) => !files.has(path)),
  );
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
  storage: StoryStorage,
  workspacePath: string,
  definition: StoryTypeDefinition,
  project: StoryProjectState,
  deletes: readonly string[],
) => {
  const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
  const writes = [
    { path: PROJECT_CONFIG_PATH, content: definitionText(definition) },
    ...project.documents.map(({ path, value }) => ({
      path,
      content: serializedContent(serializeStoryDocument(definition, value, path)),
    })),
    {
      path: manifestPath,
      content: serializedContent(serializeStoryDocument(definition, project.manifest, manifestPath)),
    },
  ];
  const writePaths = new Set(writes.map(({ path }) => path));
  await storage.writeAtomic(
    workspacePath,
    writes,
    deletes.filter((path) => !writePaths.has(path)),
  );
};

const editableDocument = async (
  storage: StoryStorage,
  workspacePath: string,
  definition: StoryTypeDefinition,
  path: string,
): Promise<StoryDocument> => {
  const file = await storage.read(workspacePath, path);
  return {
    path,
    value: parseStoryDocument(definition, parseStoredContent(path, file.content), path) as StoryDocument["value"],
    definition: editorDefinition(definition, path),
    updatedAt: file.updatedAt,
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
  storage: StoryStorage,
  workspacePath: string,
  options: Readonly<{ fallbackStoryTypeId?: string }> = {},
): StoryWorkspace => {
  const loadDefinition = () => readDefinition(storage, workspacePath);
  const describeDefinition = async () => {
    const paths = new Set(
      (await storage.list(workspacePath)).filter((entry) => !entry.isDirectory).map((entry) => entry.path),
    );
    return paths.has(PROJECT_CONFIG_PATH)
      ? loadDefinition()
      : resolveStoryType(options.fallbackStoryTypeId ?? DEFAULT_STORY_TYPE_ID);
  };
  const workspace: StoryWorkspace = {
    workspacePath,

    async initialize(input): Promise<StoryInitialization> {
      try {
        const entries = await storage.list(workspacePath);
        const paths = entries.filter((entry) => !entry.isDirectory).map((entry) => canonicalPath(entry.path));
        const configured = paths.includes(PROJECT_CONFIG_PATH);
        const definition = configured
          ? await loadDefinition()
          : resolveStoryType(input.storyTypeId ?? options.fallbackStoryTypeId ?? DEFAULT_STORY_TYPE_ID);
        if (input.storyTypeId && input.storyTypeId !== definition.id) {
          throw new Error(`工作区故事类型为 ${definition.id}，不能按 ${input.storyTypeId} 初始化。`);
        }
        const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
        const existingPaths = ordinaryStoryPaths(paths);
        if (paths.includes(manifestPath)) {
          const current = await loadProject(storage, workspacePath, definition);
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
          storage,
          workspacePath,
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
      return overview(await loadProject(storage, workspacePath, definition), definition);
    },

    async listDocuments(input = {}) {
      const definition = await loadDefinition();
      const project = await loadProject(storage, workspacePath, definition);
      const kind = input.role ? definition.roles[input.role] : undefined;
      if (input.role && !kind) throw new Error(`当前故事类型没有提供 ${input.role} 文档角色。`);
      const paths = project.documents
        .filter((entry) => !kind || storyTypeKindForPath(definition, entry.path) === kind)
        .map((entry) => entry.path)
        .sort((left, right) => left.localeCompare(right));
      return Promise.all(paths.map((path) => editableDocument(storage, workspacePath, definition, path)));
    },

    async saveDocument(document) {
      const definition = await loadDefinition();
      const path = normalizeDocumentPath(document.path);
      storyTypeKindForPath(definition, path);
      const project = await loadProject(storage, workspacePath, definition);
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
      await persistAppliedProject(storage, workspacePath, definition, applied);
      return editableDocument(storage, workspacePath, definition, path);
    },

    async removeDocument(inputPath) {
      const definition = await loadDefinition();
      const path = normalizeDocumentPath(inputPath);
      const kind = storyTypeKindForPath(definition, path);
      const document = storyTypeDocument(definition, kind);
      if (document.cardinality === "one") throw new Error(`「${document.label}」必须保留一份，不能删除。`);
      const project = await loadProject(storage, workspacePath, definition);
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
      await persistAppliedProject(storage, workspacePath, definition, applied);
    },

    normalizeDocumentPath,

    async readContext(input) {
      const definition = await loadDefinition();
      return readStoryProjectContext(await loadProject(storage, workspacePath, definition), definition, input);
    },

    async validateChanges(changeSet): Promise<StoryChangeValidation> {
      try {
        const definition = await loadDefinition();
        const applied = applyChangeSet(await loadProject(storage, workspacePath, definition), changeSet, definition);
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
        const applied = applyChangeSet(await loadProject(storage, workspacePath, definition), changeSet, definition);
        await persistAppliedProject(storage, workspacePath, definition, applied);
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

export const buildStoryProjectApi = (storage: StoryStorage): StoryProjectApi => {
  const client: StoryProjectApi = {
    listStoryTypes,
    workspace: (workspacePath: string) => createWorkspace(storage, workspacePath),
    async open(workspacePath: string) {
      await readDefinition(storage, workspacePath);
      return createWorkspace(storage, workspacePath);
    },
    async create(workspacePath, input) {
      const workspace = createWorkspace(storage, workspacePath, { fallbackStoryTypeId: input.storyTypeId });
      const result = await workspace.initialize({ ...input, storyTypeId: input.storyTypeId });
      if (!result.initialized && !result.alreadyInitialized) {
        throw new StoryProjectValidationError(result.issues);
      }
      return workspace;
    },
  };
  return Object.freeze(client);
};
