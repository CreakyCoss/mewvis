import { StoryDefinition } from "./definitions/index.js";
import type { StoryTypeSummary } from "./definitions/types.js";
import { listStoryTypes, storyFileStorageBindings } from "./story-types/index.js";
import type {
  StoryChangeResult,
  StoryChangeValidation,
  StoryContext,
  StoryDocument,
  StoryDocumentIdentity,
  StoryInitialization,
  StoryOverview,
  StoryProjectCompatibility,
  StoryProjectStructure,
  StoryProjectUpgradeResult,
} from "./types.js";
import { createStoryProjectStorage } from "./storage/index.js";
import type { StoryFileBackend } from "./storage/types.js";
import { StoryProjectValidationError } from "./errors.js";
import { createWorkspace } from "./application/index.js";

/** 将领域文档身份编码为稳定 key；不包含任何存储路径语义。 */
export const storyDocumentIdentityKey = StoryDefinition.identityKey;

/** 公共 Facade 的存储选项；Story Type 与物理布局绑定由 Facade 内部完成。 */
export type StoryProjectApiOptions =
  Readonly<{ kind: "file"; backend: StoryFileBackend }> | Readonly<{ kind: "memory" }>;

/** 一个已绑定 projectKey 的故事工作区，统一处理文档、上下文、校验与事务。 */
export interface StoryWorkspace {
  readonly projectKey: string;
  initialize(input: {
    storyId: string;
    title: string;
    storyTypeId?: string;
    replaceExisting?: boolean;
  }): Promise<StoryInitialization>;
  describe(input?: { documentKinds?: readonly string[] }): Promise<StoryProjectStructure>;
  overview(): Promise<StoryOverview>;
  listDocuments(input?: { role?: string }): Promise<StoryDocument[]>;
  saveDocument(document: Pick<StoryDocument, "ref" | "value">): Promise<StoryDocument>;
  removeDocument(identity: StoryDocumentIdentity): Promise<void>;
  readContext(input: { scope: "project" | "chapter"; targetId?: string }): Promise<StoryContext>;
  validateChanges(changeSet: unknown): Promise<StoryChangeValidation>;
  commitChanges(changeSet: unknown): Promise<StoryChangeResult>;
}

/** Story Project 的稳定公共能力；存储、故事类型与内部处理器均隐藏在实现之后。 */
export interface StoryProjectApi {
  listStoryTypes(): readonly StoryTypeSummary[];
  checkCompatibility(projectKey: string): Promise<StoryProjectCompatibility>;
  upgrade(projectKey: string): Promise<StoryProjectUpgradeResult>;
  workspace(projectKey: string): StoryWorkspace;
  open(projectKey: string): Promise<StoryWorkspace>;
  create(projectKey: string, input: { storyTypeId: string; storyId: string; title: string }): Promise<StoryWorkspace>;
}

/**
 * 故事项目的唯一公共入口。
 *
 * 调用方只提供底层存储能力；Story Type、文件布局和领域 Storage 的组装均隐藏在 Facade 内。
 */
export const createStoryProjectApi = (options: StoryProjectApiOptions): StoryProjectApi => {
  const bindings = storyFileStorageBindings();
  const storage = createStoryProjectStorage(
    options.kind === "file"
      ? { ...options, bindings }
      : { ...options, definitions: bindings.map(({ definition }) => definition) },
  );
  const client: StoryProjectApi = {
    listStoryTypes,
    checkCompatibility: (projectKey) => storage.checkCompatibility(projectKey),
    upgrade: (projectKey) => storage.upgradeProject(projectKey),
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
