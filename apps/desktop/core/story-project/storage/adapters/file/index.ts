import type { StoryValue } from "../../../types.js";
import type { StoryProjectStorageAdapter } from "../registry.js";
import {
  assertStoryProjectRevision,
  type StoryProjectRecord,
  type StoryProjectRecordBackend,
  type StoryProjectRecordWrite,
} from "../record.js";
import type {
  StoryFileBackend,
  StoryProjectRevisionCondition,
  StoryProjectStorageOptions,
  StoryTextFile,
} from "../../types.js";

type FileStorageOptions = Extract<StoryProjectStorageOptions, { kind: "file" }>;

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

export const fileStoryProjectStorageAdapter: StoryProjectStorageAdapter<FileStorageOptions> = {
  id: "file",
  create: ({ backend }) => createStoryFileRecordBackend(backend),
};
