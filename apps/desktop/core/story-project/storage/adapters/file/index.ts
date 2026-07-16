import type { StoryValue } from "../../../types.js";
import {
  assertStoryProjectRevision,
  type StoryProjectRecord,
  type StoryProjectRecordBackend,
  type StoryProjectRecordWrite,
} from "../record.js";
import type { StoryProjectRevisionCondition, StoryProjectStorageOptions, StoryTextFile } from "../../types.js";
import {
  normalizeStoryFilePath,
  replaceableStoryFilePaths,
  storyDocumentIdentityForFilePath,
  storyFilePathForIdentity,
} from "./layout.js";

type FileStorageOptions = Extract<StoryProjectStorageOptions, { kind: "file" }>;

const contentFormatForPath = (path: string) => {
  if (path.endsWith(".json")) return "structured" as const;
  if (path.endsWith(".md")) return "markdown" as const;
  return null;
};

const parseFile = (file: StoryTextFile): StoryProjectRecord => {
  const contentFormat = contentFormatForPath(file.path);
  if (contentFormat === "markdown") {
    return { key: file.path, contentFormat, value: file.content, updatedAt: file.updatedAt };
  }
  if (contentFormat === "structured") {
    try {
      return {
        key: file.path,
        contentFormat,
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
    record.contentFormat === "markdown"
      ? `${record.value.replace(/\s+$/, "")}\n`
      : `${JSON.stringify(record.value, null, 2)}\n`,
});

/** 文件后端在真正写入的原子区间内再次检查 revision。 */
export const assertStoryFileRevision = (condition: StoryProjectRevisionCondition, currentContent: string | null) =>
  assertStoryProjectRevision(
    condition,
    currentContent === null ? null : parseFile({ path: condition.key, content: currentContent, updatedAt: null }),
  );

export const createStoryFileRecordBackend = (options: FileStorageOptions): StoryProjectRecordBackend => ({
  definitionKey: normalizeStoryFilePath(options.layout.definitionPath),
  documentKey: (identity) => storyFilePathForIdentity(options.layout, identity),
  documentIdentity: (key) => storyDocumentIdentityForFilePath(options.layout, key),
  replaceableKeys: (keys) => replaceableStoryFilePaths(options.layout, keys),
  async list(projectKey) {
    return (await options.backend.list(projectKey)).flatMap((entry) => {
      const contentFormat = entry.isDirectory ? null : contentFormatForPath(entry.path);
      return contentFormat ? [{ key: entry.path, contentFormat, updatedAt: entry.updatedAt }] : [];
    });
  },

  async read(projectKey, key) {
    return parseFile(await options.backend.read(projectKey, key));
  },

  async readOptional(projectKey, key) {
    const file = await options.backend.readOptional(projectKey, key);
    return file ? parseFile(file) : null;
  },

  async commit(projectKey, transaction) {
    const entries = await options.backend.list(projectKey);
    const revisionEntry = entries.find((entry) => !entry.isDirectory && entry.path === transaction.revision.key);
    const current = revisionEntry ? parseFile(await options.backend.read(projectKey, transaction.revision.key)) : null;
    assertStoryProjectRevision(transaction.revision, current);
    await options.backend.writeAtomic(
      projectKey,
      transaction.writes.map(serializeFile),
      transaction.deletes,
      transaction.revision,
    );
  },
});
