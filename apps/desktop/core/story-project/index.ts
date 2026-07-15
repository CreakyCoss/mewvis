import type { StoryTypeSummary } from "./definitions/types.js";
import { listStoryTypes } from "./story-types/index.js";
import type {
  StoryChangeResult,
  StoryChangeValidation,
  StoryContext,
  StoryDocument,
  StoryInitialization,
  StoryOverview,
  StoryProjectStructure,
} from "./types.js";
import type { StoryProjectStorage } from "./storage/index.js";
import { StoryProjectValidationError } from "./internal/engine/issues.js";
import { createWorkspace } from "./application/workspace.js";

/** 一个已绑定 projectKey 的故事工作区，统一处理文档、上下文、校验与事务。 */
export interface StoryWorkspace {
  readonly projectKey: string;
  initialize(input: {
    storyId: string;
    title: string;
    storyTypeId?: string;
    replaceExistingJson?: boolean;
  }): Promise<StoryInitialization>;
  describe(input?: { documentKinds?: readonly string[] }): Promise<StoryProjectStructure>;
  overview(): Promise<StoryOverview>;
  listDocuments(input?: { role?: string }): Promise<StoryDocument[]>;
  saveDocument(document: Pick<StoryDocument, "path" | "value">): Promise<StoryDocument>;
  removeDocument(path: string): Promise<void>;
  normalizeDocumentPath(path: string): string;
  readContext(input: { scope: "project" | "chapter"; targetId?: string }): Promise<StoryContext>;
  validateChanges(changeSet: unknown): Promise<StoryChangeValidation>;
  commitChanges(changeSet: unknown): Promise<StoryChangeResult>;
}

/** Story Project 的稳定公共能力；存储、故事类型与内部处理器均隐藏在实现之后。 */
export interface StoryProjectApi {
  listStoryTypes(): readonly StoryTypeSummary[];
  workspace(projectKey: string): StoryWorkspace;
  open(projectKey: string): Promise<StoryWorkspace>;
  create(projectKey: string, input: { storyTypeId: string; storyId: string; title: string }): Promise<StoryWorkspace>;
}

/**
 * 故事项目的唯一公共入口。
 *
 * 调用方只提供领域级 StoryProjectStorage；文件、数据库等实现细节由 Storage 隐藏。
 */
export const createStoryProjectApi = (storage: StoryProjectStorage): StoryProjectApi => {
  const client: StoryProjectApi = {
    listStoryTypes,
    workspace: (projectKey: string) => createWorkspace(storage, projectKey),
    async open(projectKey: string) {
      if (!(await storage.loadDefinition(projectKey))) throw new Error("故事项目尚未初始化。");
      return createWorkspace(storage, projectKey);
    },
    async create(projectKey, input) {
      const workspace = createWorkspace(storage, projectKey, { fallbackStoryTypeId: input.storyTypeId });
      const result = await workspace.initialize({ ...input, storyTypeId: input.storyTypeId });
      if (!result.initialized && !result.alreadyInitialized) {
        throw new StoryProjectValidationError(result.issues);
      }
      return workspace;
    },
  };
  return Object.freeze(client);
};
