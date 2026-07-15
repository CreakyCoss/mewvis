import { buildStoryProjectApi } from "./internal/runtime.js";
import type { StoryTypeSummary } from "./definitions/types.js";
import type {
  StoryChangeResult,
  StoryChangeValidation,
  StoryContext,
  StoryDocument,
  StoryInitialization,
  StoryOverview,
  StoryProjectStructure,
  StoryStorage,
} from "./types.js";

/** 一个已绑定目录的故事工作区，统一处理文档、上下文、校验与事务。 */
export interface StoryWorkspace {
  readonly workspacePath: string;
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
  workspace(workspacePath: string): StoryWorkspace;
  open(workspacePath: string): Promise<StoryWorkspace>;
  create(
    workspacePath: string,
    input: { storyTypeId: string; storyId: string; title: string },
  ): Promise<StoryWorkspace>;
}

/**
 * 故事项目的唯一公共入口。
 *
 * 调用方只提供文件存储能力；故事类型、目录、校验、上下文与事务均由内部处理器维护。
 */
export const createStoryProjectApi = (storage: StoryStorage): StoryProjectApi => buildStoryProjectApi(storage);
