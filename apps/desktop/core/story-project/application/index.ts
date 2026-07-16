import { StoryDefinition } from "../definitions/index.js";
import { resolveStoryType } from "../story-types/index.js";
import type { StoryChangeResult, StoryChangeValidation, StoryInitialization, StoryProjectState } from "../types.js";
import type { StoryProjectStorage } from "../storage/index.js";
import type { StoryWorkspace } from "../index.js";
import { errorIssues } from "./errors.js";
import { readStoryProjectContext } from "./queries/context.js";
import { describeStoryProject } from "./queries/description.js";
import { editableStoryDocument } from "./queries/document.js";
import { projectOverview } from "./queries/overview.js";

const DEFAULT_STORY_TYPE_ID = "long-novel";

const projectRevision = (project: StoryProjectState) => {
  if (!Number.isInteger(project.manifest.revision)) throw new Error("故事 Manifest 缺少 revision。");
  return Number(project.manifest.revision);
};

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
            revision: projectRevision(current),
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
        const project = await storage.initializeProject(
          projectKey,
          definition,
          input,
          input.replaceExisting ? inventory.replaceableKeys : [],
        );
        return {
          initialized: true,
          alreadyInitialized: false,
          revision: projectRevision(project),
          manifestRef,
          existingEntryCount: inventory.replaceableKeys.length,
          issues: [],
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
      return describeStoryProject(await describeDefinition(), storage.changeSet, input);
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
      const documents = await Promise.all(refs.map((ref) => storage.loadDocument(projectKey, definition, ref)));
      return documents.map((document) => editableStoryDocument(definition, document, project.documents));
    },

    async saveDocument(document) {
      const definition = await loadDefinition();
      const saved = await storage.saveDocument(projectKey, definition, document);
      const project = await storage.loadProject(projectKey, definition);
      return editableStoryDocument(definition, saved, project.documents);
    },

    async removeDocument(inputRef) {
      const definition = await loadDefinition();
      await storage.removeDocument(projectKey, definition, inputRef);
    },

    async readContext(input) {
      const definition = await loadDefinition();
      return readStoryProjectContext(await storage.loadProject(projectKey, definition), definition, input);
    },

    async validateChanges(changeSet): Promise<StoryChangeValidation> {
      try {
        const definition = await loadDefinition();
        const applied = await storage.validateChanges(projectKey, definition, changeSet);
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
        const applied = await storage.commitChanges(projectKey, definition, changeSet);
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
