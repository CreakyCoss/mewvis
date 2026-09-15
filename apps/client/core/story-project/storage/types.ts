import type { StoryTypeDefinition } from "../definitions/types.js";

export type StoryProjectInventory = Readonly<{
  initialized: boolean;
  replaceableKeys: readonly string[];
}>;

export type StoryFileLayout = Readonly<{
  definitionPath: string;
  documentPaths: Readonly<Record<string, string>>;
  managedRoots: readonly string[];
  preservedPaths?: readonly string[];
}>;

/** File Storage 需要的 Story Type 绑定；具体 Story Type 模块负责组装 definition 与 layout。 */
export type StoryFileStorageBinding = Readonly<{
  definition: StoryTypeDefinition;
  layout: StoryFileLayout;
}>;

export type StoryProjectRevisionCondition = Readonly<{
  key: string;
  /** null 表示提交时该 revision 记录必须尚不存在。 */
  expected: number | null;
}>;

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

/** 文件系统实现只需提供文本文件能力；结构化记录编码由 File Adapter 完成。 */
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

export type StoryProjectStorageOptions =
  | Readonly<{ kind: "file"; backend: StoryFileBackend; bindings: readonly StoryFileStorageBinding[] }>
  | Readonly<{ kind: "memory"; bindings: readonly StoryFileStorageBinding[] }>;
