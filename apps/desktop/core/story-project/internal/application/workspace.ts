import { resolveStoryTypePath, storyTypeDocument, storyTypeKindForPath } from "../../definitions/definition.js";
import { resolveStoryType } from "../../story-types/index.js";
import type { StoryChangeResult, StoryChangeValidation, StoryInitialization } from "../../types.js";
import type { StoryProjectStore } from "../../storage/index.js";
import type { StoryWorkspace } from "../../index.js";
import { applyChangeSet } from "../engine/changes.js";
import { StoryProjectValidationError } from "../engine/issues.js";
import { createInitialProject, projectInfo } from "../engine/project.js";
import { validateProject } from "../engine/validation.js";
import { readStoryProjectContext } from "../projections/context.js";
import { describeStoryProject } from "../projections/description.js";
import { projectOverview } from "../projections/overview.js";
import { errorIssues } from "./errors.js";
import {
  editableDocument,
  loadProject,
  persistAppliedProject,
  persistInitialProject,
  PROJECT_CONFIG_PATH,
  readDefinition,
} from "./project-repository.js";

type JsonObject = Record<string, unknown>;

const DEFAULT_STORY_TYPE_ID = "long-novel";
const STORY_ROOT = "story/";

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const canonicalPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const ordinaryStoryKeys = (keys: readonly string[]) =>
  keys.filter(
    (key) =>
      key.startsWith(STORY_ROOT) &&
      !key.startsWith("story/.novel-claw/") &&
      !key.startsWith("story/runtime/") &&
      key !== "story/tavern.json" &&
      (key.endsWith(".json") || key.endsWith(".md")),
  );

export const normalizeDocumentPath = (input: string) => {
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

export const createWorkspace = (
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
      return projectOverview(await loadProject(store, projectKey, definition), definition);
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
