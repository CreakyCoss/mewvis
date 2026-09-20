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
