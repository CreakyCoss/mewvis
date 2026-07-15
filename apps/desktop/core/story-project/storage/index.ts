import type { StoryTypeDefinition } from "../definitions/types.js";
import type { StoryDocument, StoryProjectAppliedChanges, StoryProjectState } from "../types.js";

export type StoryProjectInventory = Readonly<{
  initialized: boolean;
  replaceablePaths: readonly string[];
  existingJsonPaths: readonly string[];
}>;

export class StoryProjectRevisionConflictError extends Error {
  readonly key: string;
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;

  constructor(key: string, expectedRevision: number | null, actualRevision: number | null) {
    const expected = expectedRevision === null ? "记录不存在" : `revision ${expectedRevision}`;
    const actual = actualRevision === null ? "记录不存在或 revision 无效" : `revision ${actualRevision}`;
    super(`故事项目版本冲突：${key} 期望 ${expected}，实际为 ${actual}。`);
    this.name = "StoryProjectRevisionConflictError";
    this.key = key;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/** Story Project 的领域级持久化边界；调用方无需感知文件、数据库或低层记录事务。 */
export interface StoryProjectStorage {
  normalizeDocumentPath(path: string): string;
  loadDefinition(projectKey: string): Promise<StoryTypeDefinition | null>;
  inspect(projectKey: string, definition: StoryTypeDefinition): Promise<StoryProjectInventory>;
  loadProject(projectKey: string, definition: StoryTypeDefinition): Promise<StoryProjectState>;
  loadDocument(
    projectKey: string,
    definition: StoryTypeDefinition,
    path: string,
  ): Promise<Pick<StoryDocument, "path" | "value" | "updatedAt">>;
  initializeProject(
    projectKey: string,
    definition: StoryTypeDefinition,
    project: StoryProjectState,
    replacePaths: readonly string[],
  ): Promise<void>;
  persistAppliedProject(
    projectKey: string,
    definition: StoryTypeDefinition,
    applied: StoryProjectAppliedChanges,
  ): Promise<void>;
}
