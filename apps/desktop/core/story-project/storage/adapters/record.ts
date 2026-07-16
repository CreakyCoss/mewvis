import type { StoryValue } from "../../types.js";
import { StoryProjectRevisionConflictError } from "../errors.js";
import type { StoryProjectRevisionCondition } from "../types.js";

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

export type StoryProjectRecordTransaction = Readonly<{
  revision: StoryProjectRevisionCondition;
  writes: readonly StoryProjectRecordWrite[];
  deletes: readonly string[];
}>;

const recordRevision = (record: StoryProjectRecord | null) => {
  if (!record || record.contentType !== "json" || !record.value || typeof record.value !== "object") return null;
  const revision = Array.isArray(record.value) ? undefined : record.value.revision;
  return Number.isInteger(revision) ? Number(revision) : null;
};

export const assertStoryProjectRevision = (
  condition: StoryProjectRevisionCondition,
  current: StoryProjectRecord | null,
) => {
  const actual = recordRevision(current);
  const matched = condition.expected === null ? current === null : actual === condition.expected;
  if (!matched) throw new StoryProjectRevisionConflictError(condition.key, condition.expected, actual);
};

/** Adapter 向 Storage Facade 提供的统一结构化记录接口。 */
export interface StoryProjectRecordBackend {
  list(projectKey: string): Promise<readonly StoryProjectRecordInfo[]>;
  read(projectKey: string, key: string): Promise<StoryProjectRecord>;
  readOptional(projectKey: string, key: string): Promise<StoryProjectRecord | null>;
  commit(projectKey: string, transaction: StoryProjectRecordTransaction): Promise<void>;
}
