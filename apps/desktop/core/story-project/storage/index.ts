import type { StoryValue } from "../types.js";

export type StoryProjectRecordInfo = Readonly<{
  key: string;
  contentType: "json" | "markdown";
  updatedAt: number | null;
}>;

export type StoryProjectRecord =
  | Readonly<{
      key: string;
      contentType: "json";
      value: StoryValue;
      updatedAt: number | null;
    }>
  | Readonly<{
      key: string;
      contentType: "markdown";
      value: string;
      updatedAt: number | null;
    }>;

export type StoryProjectRecordWrite =
  | Readonly<{ key: string; contentType: "json"; value: StoryValue }>
  | Readonly<{ key: string; contentType: "markdown"; value: string }>;

export type StoryProjectRevisionCondition = Readonly<{
  key: string;
  /** null 表示提交时该 revision 记录必须尚不存在。 */
  expected: number | null;
}>;

export type StoryProjectTransaction = Readonly<{
  revision: StoryProjectRevisionCondition;
  writes: readonly StoryProjectRecordWrite[];
  deletes: readonly string[];
}>;

export class StoryProjectRevisionConflictError extends Error {
  readonly key: string;
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;

  constructor(condition: StoryProjectRevisionCondition, actualRevision: number | null) {
    const expected = condition.expected === null ? "记录不存在" : `revision ${condition.expected}`;
    const actual = actualRevision === null ? "记录不存在或 revision 无效" : `revision ${actualRevision}`;
    super(`故事项目版本冲突：${condition.key} 期望 ${expected}，实际为 ${actual}。`);
    this.name = "StoryProjectRevisionConflictError";
    this.key = condition.key;
    this.expectedRevision = condition.expected;
    this.actualRevision = actualRevision;
  }
}

const recordRevision = (record: StoryProjectRecord | null) => {
  if (!record || record.contentType !== "json" || !record.value || typeof record.value !== "object") return null;
  const revision = Array.isArray(record.value) ? undefined : record.value.revision;
  return Number.isInteger(revision) ? Number(revision) : null;
};

/** 供内存、文件、数据库等 Store 实现复用的 revision 条件检查。 */
export const assertStoryProjectRevision = (
  condition: StoryProjectRevisionCondition,
  current: StoryProjectRecord | null,
) => {
  const actual = recordRevision(current);
  const matched = condition.expected === null ? current === null : actual === condition.expected;
  if (!matched) throw new StoryProjectRevisionConflictError(condition, actual);
};

/**
 * Story Project 唯一持久化协议。
 *
 * key 是故事协议中的逻辑位置，不代表物理文件路径；实现必须原子检查 revision 并提交整批变更。
 */
export interface StoryProjectStore {
  list(projectKey: string): Promise<readonly StoryProjectRecordInfo[]>;
  read(projectKey: string, key: string): Promise<StoryProjectRecord>;
  commit(projectKey: string, transaction: StoryProjectTransaction): Promise<void>;
}
