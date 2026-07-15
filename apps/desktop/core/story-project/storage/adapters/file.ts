import {
  assertStoryProjectRevision,
  type StoryProjectRecord,
  type StoryProjectRecordBackend,
  type StoryProjectRecordWrite,
  type StoryProjectRevisionCondition,
} from "../core/backend.js";
import { createStoryProjectStorage } from "../core/project-storage.js";
import type { StoryValue } from "../../types.js";

export type StoryFileEntry = Readonly<{
  path: string;
  isDirectory: boolean;
  updatedAt: number | null;
}>;

export type StoryTextFile = Readonly<{
  path: string;
  content: string;
  updatedAt: number | null;
}>;

/** 文件系统实现只需提供文本文件能力；结构化记录编码由通用适配器统一完成。 */
export interface StoryFileBackend {
  list(root: string): Promise<readonly StoryFileEntry[]>;
  read(root: string, path: string): Promise<StoryTextFile>;
  readOptional(root: string, path: string): Promise<StoryTextFile | null>;
  writeAtomic(
    root: string,
    writes: readonly Readonly<{ path: string; content: string }>[],
    deletes: readonly string[],
    revision: StoryProjectRevisionCondition,
  ): Promise<void>;
}

const contentTypeForPath = (path: string) => {
  if (path.endsWith(".json")) return "json" as const;
  if (path.endsWith(".md")) return "markdown" as const;
  return null;
};

const parseFile = (file: StoryTextFile): StoryProjectRecord => {
  const contentType = contentTypeForPath(file.path);
  if (contentType === "markdown") {
    return { key: file.path, contentType, value: file.content, updatedAt: file.updatedAt };
  }
  if (contentType === "json") {
    try {
      return {
        key: file.path,
        contentType,
        value: JSON.parse(file.content) as StoryValue,
        updatedAt: file.updatedAt,
      };
    } catch {
      throw new Error(`故事 JSON 无法解析：${file.path}`);
    }
  }
  throw new Error(`故事文件仅支持 JSON 或 Markdown：${file.path}`);
};

const serializeFile = (record: StoryProjectRecordWrite) => ({
  path: record.key,
  content:
    record.contentType === "markdown"
      ? `${record.value.replace(/\s+$/, "")}\n`
      : `${JSON.stringify(record.value, null, 2)}\n`,
});

/** 文件后端在真正写入的原子区间内再次检查 revision。 */
export const assertStoryFileRevision = (condition: StoryProjectRevisionCondition, currentContent: string | null) =>
  assertStoryProjectRevision(
    condition,
    currentContent === null ? null : parseFile({ path: condition.key, content: currentContent, updatedAt: null }),
  );

const createStoryFileRecordBackend = (backend: StoryFileBackend): StoryProjectRecordBackend => ({
  async list(projectKey) {
    return (await backend.list(projectKey)).flatMap((entry) => {
      const contentType = entry.isDirectory ? null : contentTypeForPath(entry.path);
      return contentType ? [{ key: entry.path, contentType, updatedAt: entry.updatedAt }] : [];
    });
  },

  async read(projectKey, key) {
    return parseFile(await backend.read(projectKey, key));
  },

  async readOptional(projectKey, key) {
    const file = await backend.readOptional(projectKey, key);
    return file ? parseFile(file) : null;
  },

  async commit(projectKey, transaction) {
    const entries = await backend.list(projectKey);
    const revisionEntry = entries.find((entry) => !entry.isDirectory && entry.path === transaction.revision.key);
    const current = revisionEntry ? parseFile(await backend.read(projectKey, transaction.revision.key)) : null;
    assertStoryProjectRevision(transaction.revision, current);
    await backend.writeAtomic(
      projectKey,
      transaction.writes.map(serializeFile),
      transaction.deletes,
      transaction.revision,
    );
  },
});

/** 创建由文本文件后端驱动的领域级 Story Project Storage。 */
export const createStoryFileStorage = (backend: StoryFileBackend) =>
  createStoryProjectStorage(createStoryFileRecordBackend(backend));
