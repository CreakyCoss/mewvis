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
} from "./types.js";
import type { StoryProjectStore } from "./storage/index.js";

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
 * 调用方只提供结构化 StoryProjectStore；文件、数据库等持久化方式由 Store 实现决定。
 */
export const createStoryProjectApi = (store: StoryProjectStore): StoryProjectApi => buildStoryProjectApi(store);
