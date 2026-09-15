import type { StoryTypeDefinition } from "../../../definitions/types.js";
import type { StoryValue } from "../../../types.js";
import {
  assertStoryProjectRevision,
  type StoryProjectBackendProvider,
  type StoryProjectRecord,
  type StoryProjectRecordBackend,
  type StoryProjectRecordWrite,
} from "../record.js";
import type {
  StoryFileBackend,
  StoryFileLayout,
  StoryFileStorageBinding,
  StoryProjectRevisionCondition,
  StoryProjectStorageOptions,
  StoryTextFile,
} from "../../types.js";
import {
  assertStoryFileLayout,
  normalizeStoryFilePath,
  replaceableStoryFilePaths,
  storyDocumentIdentityForFilePath,
  storyFilePathForIdentity,
} from "./layout.js";

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

export const createStoryFileRecordBackend = (
  backend: StoryFileBackend,
  layout: StoryFileLayout,
): StoryProjectRecordBackend => ({
  definitionKey: normalizeStoryFilePath(layout.definitionPath),
  documentKey: (identity) => storyFilePathForIdentity(layout, identity),
  documentIdentity: (key) => storyDocumentIdentityForFilePath(layout, key),
  replaceableKeys: (keys) => replaceableStoryFilePaths(layout, keys),
  async list(projectKey) {
    return (await backend.list(projectKey)).flatMap((entry) => {
      const contentFormat = entry.isDirectory ? null : contentFormatForPath(entry.path);
      return contentFormat ? [{ key: entry.path, contentFormat, updatedAt: entry.updatedAt }] : [];
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

type FileStoryProjectStorageOptions = Extract<StoryProjectStorageOptions, { kind: "file" }>;

const bindingKey = (definition: Pick<StoryTypeDefinition, "id" | "version">) =>
  `${definition.id}@${definition.version}`;

/** File 模式自行负责 Story Type 绑定校验与 Record Backend 缓存。 */
export const createFileStoryProjectBackendProvider = (
  options: FileStoryProjectStorageOptions,
): StoryProjectBackendProvider => {
  if (options.bindings.length === 0) throw new Error("File Storage 至少需要绑定一个 Story Type。");
  const definitionPaths = new Set(options.bindings.map(({ layout }) => layout.definitionPath));
  if (definitionPaths.size !== 1) throw new Error("File Storage 的 Story Type 必须使用相同的定义文件路径。");

  const bindings = new Map<string, StoryFileStorageBinding>();
  const backends = new Map<string, StoryProjectRecordBackend>();
  for (const binding of options.bindings) {
    const key = bindingKey(binding.definition);
    if (bindings.has(key)) throw new Error(`File Storage 重复绑定 Story Type：${key}`);
    assertStoryFileLayout(binding.layout, binding.definition);
    bindings.set(key, binding);
  }

  const backendForBinding = (binding: StoryFileStorageBinding) => {
    const key = bindingKey(binding.definition);
    const current = backends.get(key);
    if (current) return current;
    const created = createStoryFileRecordBackend(options.backend, binding.layout);
    backends.set(key, created);
    return created;
  };

  const backendForDefinition = (definition: StoryTypeDefinition) => {
    const key = bindingKey(definition);
    const binding = bindings.get(key);
    if (!binding) throw new Error(`File Storage 未绑定 Story Type：${key}`);
    assertStoryFileLayout(binding.layout, definition);
    return backendForBinding(binding);
  };

  return Object.freeze({
    definitionBackend: backendForBinding(options.bindings[0]),
    backendForDefinition,
  });
};
