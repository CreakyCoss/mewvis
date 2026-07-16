import { StoryDefinition } from "../definitions/index.js";
import { resolveStoryType } from "../story-types/index.js";
import type { StoryChangeResult, StoryChangeValidation, StoryDocumentIdentity, StoryInitialization } from "../types.js";
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
        const manifestRef = StoryDefinition.identity(definition, definition.manifestKind);
        const inventory = await storage.inspect(projectKey, definition);
        if (inventory.initialized) {
          const current = await storage.loadProject(projectKey, definition);
          return {
            initialized: false,
            alreadyInitialized: true,
            revision: projectInfo(current).revision,
            manifestRef,
            existingEntryCount: inventory.replaceableKeys.length,
            issues: [],
            hint: "故事项目已经初始化，请先读取上下文再增量提交。",
          };
        }
        if (inventory.replaceableKeys.length > 0 && !input.replaceExisting) {
          return {
            initialized: false,
            alreadyInitialized: false,
            revision: null,
            manifestRef,
            existingEntryCount: inventory.replaceableKeys.length,
            issues: [
              {
                severity: "error",
                code: "initialize.existing-records",
                path: "initialize",
                message: "存储中已有不受当前故事项目管理的记录；明确允许替换后才能初始化。",
              },
            ],
            hint: "确认现有存储记录可以被替换后，将 replaceExisting 设为 true 重试。",
          };
        }
        const project = createInitialProject(definition, input);
        const validation = validateProject(project, definition, "draft");
        if (!validation.valid) throw new StoryProjectValidationError(validation.issues);
        await storage.initializeProject(
          projectKey,
          definition,
          project,
          input.replaceExisting ? inventory.replaceableKeys : [],
        );
        return {
          initialized: true,
          alreadyInitialized: false,
          revision: projectInfo(project).revision,
          manifestRef,
          existingEntryCount: inventory.replaceableKeys.length,
          issues: validation.issues,
          hint: null,
        };
      } catch (error) {
        return {
          initialized: false,
          alreadyInitialized: false,
          revision: null,
          manifestRef: null,
          existingEntryCount: 0,
          issues: errorIssues(error, "initialize", "initialize.invalid"),
          hint: "未创建任何正式故事文档。请修正故事类型或初始化参数后重试。",
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
      const refs = project.documents
        .filter((entry) => !kind || entry.ref.kind === kind)
        .map((entry) => entry.ref)
        .sort((left, right) => StoryDefinition.identityKey(left).localeCompare(StoryDefinition.identityKey(right)));
      return Promise.all(
        refs.map(async (ref) =>
          editableStoryDocument(definition, await storage.loadDocument(projectKey, definition, ref)),
        ),
      );
    },

    async saveDocument(document) {
      const definition = await loadDefinition();
      const ref = StoryDefinition.identity(definition, document.ref.kind, document.ref.identity);
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
          operations: [{ type: "upsert", ref, value: document.value }],
        },
        definition,
      );
      await storage.persistAppliedProject(projectKey, definition, applied);
      return editableStoryDocument(definition, await storage.loadDocument(projectKey, definition, ref));
    },

    async removeDocument(inputRef) {
      const definition = await loadDefinition();
      const ref = StoryDefinition.identity(definition, inputRef.kind, inputRef.identity);
      const document = StoryDefinition.document(definition, ref.kind);
      if (document.cardinality === "one") throw new Error(`「${document.label}」必须保留一份，不能删除。`);
      const project = await storage.loadProject(projectKey, definition);
      const refKey = StoryDefinition.identityKey(ref);
      const current = project.documents.find((entry) => StoryDefinition.identityKey(entry.ref) === refKey)?.value;
      const id = isObject(current) && typeof current.id === "string" ? current.id : "";
      const companionRefs: StoryDocumentIdentity[] = id
        ? (document.companionKinds ?? []).flatMap((companionKind) => {
            const companion = StoryDefinition.document(definition, companionKind);
            if (companion.cardinality !== "many") return [];
            try {
              const identity = Object.fromEntries(
                companion.identityFields.map((field) => [
                  field,
                  isObject(current) && typeof current[field] === "string" ? current[field] : id,
                ]),
              );
              return [StoryDefinition.identity(definition, companionKind, identity)];
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
          operations: [ref, ...companionRefs]
            .filter(
              (targetRef, index, refs) =>
                refs.findIndex(
                  (candidate) => StoryDefinition.identityKey(candidate) === StoryDefinition.identityKey(targetRef),
                ) === index,
            )
            .filter((targetRef) =>
              project.documents.some(
                (entry) => StoryDefinition.identityKey(entry.ref) === StoryDefinition.identityKey(targetRef),
              ),
            )
            .map((targetRef) => ({ type: "delete" as const, ref: targetRef })),
        },
        definition,
      );
      await storage.persistAppliedProject(projectKey, definition, applied);
    },

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
          changedDocuments: applied.changedDocuments,
        };
      } catch (error) {
        return {
          valid: false,
          nextRevision: null,
          issues: errorIssues(error),
          batch: null,
          operationTypes: [],
          changedDocuments: [],
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
          changedDocuments: applied.changedDocuments,
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
          changedDocuments: [],
          validation: null,
          issues: errorIssues(error),
          hint: "正式故事文档未修改。请读取最新 revision，并只修正当前小批次后重新提交。",
        };
      }
    },
  };
  return Object.freeze(workspace);
};
