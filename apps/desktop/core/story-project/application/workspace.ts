import { resolveStoryTypePath, storyTypeDocument, storyTypeKindForPath } from "../definitions/definition.js";
import { resolveStoryType } from "../story-types/index.js";
import type { StoryChangeResult, StoryChangeValidation, StoryInitialization } from "../types.js";
import type { StoryProjectStorage } from "../storage/index.js";
import type { StoryWorkspace } from "../index.js";
import { applyChangeSet } from "../internal/engine/changes.js";
import { StoryProjectValidationError } from "../internal/engine/issues.js";
import { createInitialProject, projectInfo } from "../internal/engine/project.js";
import { validateProject } from "../internal/engine/validation.js";
import { readStoryProjectContext } from "../internal/projections/context.js";
import { describeStoryProject } from "../internal/projections/description.js";
import { editableStoryDocument } from "../internal/projections/document.js";
import { projectOverview } from "../internal/projections/overview.js";
import { errorIssues } from "./errors.js";

type JsonObject = Record<string, unknown>;

const DEFAULT_STORY_TYPE_ID = "long-novel";

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const createWorkspace = (
  storage: StoryProjectStorage,
  projectKey: string,
  options: Readonly<{ fallbackStoryTypeId?: string }> = {},
): StoryWorkspace => {
  const loadDefinition = async () => {
    const definition = await storage.loadDefinition(projectKey);
    if (!definition) throw new Error("故事项目尚未初始化。");
    return definition;
  };
  const describeDefinition = async () => {
    const definition = await storage.loadDefinition(projectKey);
    return definition ?? resolveStoryType(options.fallbackStoryTypeId ?? DEFAULT_STORY_TYPE_ID);
  };
  const workspace: StoryWorkspace = {
    projectKey,

    async initialize(input): Promise<StoryInitialization> {
      try {
        const storedDefinition = await storage.loadDefinition(projectKey);
        const definition =
          storedDefinition ??
          resolveStoryType(input.storyTypeId ?? options.fallbackStoryTypeId ?? DEFAULT_STORY_TYPE_ID);
        if (input.storyTypeId && input.storyTypeId !== definition.id) {
          throw new Error(`工作区故事类型为 ${definition.id}，不能按 ${input.storyTypeId} 初始化。`);
        }
        const manifestPath = resolveStoryTypePath(definition, definition.manifestKind);
        const inventory = await storage.inspect(projectKey, definition);
        if (inventory.initialized) {
          const current = await storage.loadProject(projectKey, definition);
          return {
            initialized: false,
            alreadyInitialized: true,
            revision: projectInfo(current).revision,
            manifestPath,
            existingJsonPaths: [...inventory.existingJsonPaths],
            issues: [],
            hint: "故事项目已经初始化，请先读取上下文再增量提交。",
          };
        }
        if (inventory.replaceablePaths.length > 0 && !input.replaceExistingJson) {
          return {
            initialized: false,
            alreadyInitialized: false,
            revision: null,
            manifestPath,
            existingJsonPaths: [...inventory.existingJsonPaths],
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
        await storage.initializeProject(
          projectKey,
          definition,
          project,
          input.replaceExistingJson ? inventory.replaceablePaths : [],
        );
        return {
          initialized: true,
          alreadyInitialized: false,
          revision: projectInfo(project).revision,
          manifestPath,
          existingJsonPaths: [...inventory.existingJsonPaths],
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
      return projectOverview(await storage.loadProject(projectKey, definition), definition);
    },

    async listDocuments(input = {}) {
      const definition = await loadDefinition();
      const project = await storage.loadProject(projectKey, definition);
      const kind = input.role ? definition.roles[input.role] : undefined;
      if (input.role && !kind) throw new Error(`当前故事类型没有提供 ${input.role} 文档角色。`);
      const paths = project.documents
        .filter((entry) => !kind || storyTypeKindForPath(definition, entry.path) === kind)
        .map((entry) => entry.path)
        .sort((left, right) => left.localeCompare(right));
      return Promise.all(
        paths.map(async (path) =>
          editableStoryDocument(definition, await storage.loadDocument(projectKey, definition, path)),
        ),
      );
    },

    async saveDocument(document) {
      const definition = await loadDefinition();
      const path = storage.normalizeDocumentPath(document.path);
      storyTypeKindForPath(definition, path);
      const project = await storage.loadProject(projectKey, definition);
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
      await storage.persistAppliedProject(projectKey, definition, applied);
      return editableStoryDocument(definition, await storage.loadDocument(projectKey, definition, path));
    },

    async removeDocument(inputPath) {
      const definition = await loadDefinition();
      const path = storage.normalizeDocumentPath(inputPath);
      const kind = storyTypeKindForPath(definition, path);
      const document = storyTypeDocument(definition, kind);
      if (document.cardinality === "one") throw new Error(`「${document.label}」必须保留一份，不能删除。`);
      const project = await storage.loadProject(projectKey, definition);
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
      await storage.persistAppliedProject(projectKey, definition, applied);
    },

    normalizeDocumentPath: (path) => storage.normalizeDocumentPath(path),

    async readContext(input) {
      const definition = await loadDefinition();
      return readStoryProjectContext(await storage.loadProject(projectKey, definition), definition, input);
    },

    async validateChanges(changeSet): Promise<StoryChangeValidation> {
      try {
        const definition = await loadDefinition();
        const applied = applyChangeSet(await storage.loadProject(projectKey, definition), changeSet, definition);
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
        const applied = applyChangeSet(await storage.loadProject(projectKey, definition), changeSet, definition);
        await storage.persistAppliedProject(projectKey, definition, applied);
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
