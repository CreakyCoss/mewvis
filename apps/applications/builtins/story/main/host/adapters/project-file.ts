import { APP_DATA_DIR_NAME } from "@mewvis/product-config";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createStoryProjectApi,
  type StoryWorkspace,
} from "../../../core/project/index.js";
import { assertStoryFileRevision } from "../../../core/project/storage/adapters/file/index.js";
import type {
  StoryFileBackend,
  StoryFileEntry,
} from "../../../core/project/storage/types.js";

/** Story Tool 只消费绑定后的标准故事工作区，不感知文件系统或故事类型实现。 */
export interface StoryToolRepository {
  readonly project: StoryWorkspace;
}

export const safeWorkspacePath = (
  workspacePath: string,
  relativePath: string,
) => {
  const normalized = relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`非法故事文件路径：${relativePath}`);
  }
  const target = resolve(workspacePath, normalized);
  const rootRelative = relative(resolve(workspacePath), target);
  if (
    !rootRelative ||
    rootRelative.startsWith("..") ||
    isAbsolute(rootRelative)
  ) {
    throw new Error(`故事文件路径超出工作区：${relativePath}`);
  }
  return { normalized, target };
};

export const assertNoSymlinks = async (
  workspacePath: string,
  relativePath: string,
) => {
  const { normalized } = safeWorkspacePath(workspacePath, relativePath);
  let current = resolve(workspacePath);
  for (const segment of normalized.split("/")) {
    current = join(current, segment);
    const metadata = await lstat(current).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!metadata) break;
    if (metadata.isSymbolicLink())
      throw new Error(`故事文件路径包含符号链接：${relativePath}`);
  }
};

const workspaceWriteQueues = new Map<string, Promise<void>>();

const withWorkspaceWriteLock = async <T>(
  workspacePath: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const key = resolve(workspacePath);
  const previous = workspaceWriteQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const current = previous.catch(() => undefined).then(() => gate);
  workspaceWriteQueues.set(key, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (workspaceWriteQueues.get(key) === current)
      workspaceWriteQueues.delete(key);
  }
};

const listFiles = async (workspacePath: string): Promise<StoryFileEntry[]> => {
  const storyRoot = join(workspacePath, "story");
  await assertNoSymlinks(workspacePath, "story");
  const walk = async (current: string): Promise<StoryFileEntry[]> => {
    const entries = await readdir(current, { withFileTypes: true }).catch(
      () => [],
    );
    return (
      await Promise.all(
        entries.map(async (entry): Promise<StoryFileEntry[]> => {
          const path = join(current, entry.name);
          const relativePath = relative(workspacePath, path).replace(
            /\\/g,
            "/",
          );
          if (entry.isDirectory()) {
            return [
              { path: relativePath, isDirectory: true, updatedAt: null },
              ...(await walk(path)),
            ];
          }
          if (!entry.isFile()) return [];
          const metadata = await stat(path);
          return [
            {
              path: relativePath,
              isDirectory: false,
              updatedAt: metadata.mtimeMs,
            },
          ];
        }),
      )
    ).flat();
  };
  return walk(storyRoot);
};

const writeAtomicUnlocked: StoryFileBackend["writeAtomic"] = async (
  workspacePath,
  writes,
  deletes,
  revision,
) => {
  const transactionRoot = join(
    workspacePath,
    `${APP_DATA_DIR_NAME}-story-${randomUUID()}`,
  );
  const stagedRoot = join(transactionRoot, "staged");
  const backupRoot = join(transactionRoot, "backup");
  const touchedPaths = [
    ...new Set([...writes.map((entry) => entry.path), ...deletes]),
  ];
  const applied: string[] = [];
  try {
    await Promise.all(
      [revision.key, ...touchedPaths].map((path) =>
        assertNoSymlinks(workspacePath, path),
      ),
    );
    const revisionTarget = safeWorkspacePath(
      workspacePath,
      revision.key,
    ).target;
    const currentRevisionContent = await readFile(revisionTarget, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    assertStoryFileRevision(revision, currentRevisionContent);
    for (const entry of writes) {
      const staged = safeWorkspacePath(stagedRoot, entry.path).target;
      await mkdir(dirname(staged), { recursive: true });
      await writeFile(staged, entry.content, "utf8");
    }
    for (const path of touchedPaths) {
      const target = safeWorkspacePath(workspacePath, path).target;
      const backup = safeWorkspacePath(backupRoot, path).target;
      const metadata = await stat(target).catch(() => null);
      if (metadata?.isFile()) {
        await mkdir(dirname(backup), { recursive: true });
        await cp(target, backup);
      }
    }
    for (const entry of writes) {
      const target = safeWorkspacePath(workspacePath, entry.path).target;
      const staged = safeWorkspacePath(stagedRoot, entry.path).target;
      await mkdir(dirname(target), { recursive: true });
      await rm(target, { force: true });
      await rename(staged, target);
      applied.push(entry.path);
    }
    for (const path of deletes) {
      const target = safeWorkspacePath(workspacePath, path).target;
      if (await stat(target).catch(() => null)) {
        await rm(target, { force: true });
        applied.push(path);
      }
    }
  } catch (error) {
    for (const path of applied.reverse()) {
      const target = safeWorkspacePath(workspacePath, path).target;
      const backup = safeWorkspacePath(backupRoot, path).target;
      await rm(target, { force: true }).catch(() => undefined);
      if (await stat(backup).catch(() => null)) {
        await mkdir(dirname(target), { recursive: true });
        await cp(backup, target);
      }
    }
    throw error;
  } finally {
    await rm(transactionRoot, { recursive: true, force: true });
  }
};

const writeAtomic: StoryFileBackend["writeAtomic"] = (
  workspacePath,
  writes,
  deletes,
  revision,
) =>
  withWorkspaceWriteLock(workspacePath, () =>
    writeAtomicUnlocked(workspacePath, writes, deletes, revision),
  );

const nodeStoryFileBackend: StoryFileBackend = {
  list: listFiles,
  async read(workspacePath, path) {
    await assertNoSymlinks(workspacePath, path);
    const target = safeWorkspacePath(workspacePath, path).target;
    const [content, metadata] = await Promise.all([
      readFile(target, "utf8"),
      stat(target),
    ]);
    return { path, content, updatedAt: metadata.mtimeMs };
  },
  async readOptional(workspacePath, path) {
    await assertNoSymlinks(workspacePath, path);
    const target = safeWorkspacePath(workspacePath, path).target;
    try {
      const [content, metadata] = await Promise.all([
        readFile(target, "utf8"),
        stat(target),
      ]);
      return { path, content, updatedAt: metadata.mtimeMs };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  writeAtomic,
};

export const storyProjectApi = createStoryProjectApi({
  kind: "file",
  backend: nodeStoryFileBackend,
});

export const createNodeStoryToolRepository = (
  workspacePath: string,
): StoryToolRepository => ({
  project: storyProjectApi.workspace(workspacePath),
});
