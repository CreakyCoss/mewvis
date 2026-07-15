import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createStoryProjectApi } from "../../../../../../core/story-project/index.js";
import type { StoryStorage } from "../../../../../../core/story-project/types.js";
import type { StoryToolRepository } from "./repository.js";

type StoryStorageEntry = Awaited<ReturnType<StoryStorage["list"]>>[number];

const safeWorkspacePath = (workspacePath: string, relativePath: string) => {
  const normalized = relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!normalized || isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`非法故事文件路径：${relativePath}`);
  }
  const target = resolve(workspacePath, normalized);
  const rootRelative = relative(resolve(workspacePath), target);
  if (!rootRelative || rootRelative.startsWith("..") || isAbsolute(rootRelative)) {
    throw new Error(`故事文件路径超出工作区：${relativePath}`);
  }
  return { normalized, target };
};

const listFiles = async (workspacePath: string): Promise<StoryStorageEntry[]> => {
  const storyRoot = join(workspacePath, "story");
  const walk = async (current: string): Promise<StoryStorageEntry[]> => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    return (
      await Promise.all(
        entries.map(async (entry): Promise<StoryStorageEntry[]> => {
          const path = join(current, entry.name);
          const relativePath = relative(workspacePath, path).replace(/\\/g, "/");
          if (entry.isDirectory()) {
            return [{ path: relativePath, isDirectory: true, updatedAt: null }, ...(await walk(path))];
          }
          if (!entry.isFile()) return [];
          const metadata = await stat(path);
          return [{ path: relativePath, isDirectory: false, updatedAt: metadata.mtimeMs }];
        }),
      )
    ).flat();
  };
  return walk(storyRoot);
};

const writeAtomic: StoryStorage["writeAtomic"] = async (workspacePath, writes, deletes = []) => {
  const transactionRoot = join(workspacePath, `.novel-claw-story-${randomUUID()}`);
  const stagedRoot = join(transactionRoot, "staged");
  const backupRoot = join(transactionRoot, "backup");
  const touchedPaths = [...new Set([...writes.map((entry) => entry.path), ...deletes])];
  const applied: string[] = [];
  try {
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

const nodeStoryStorage: StoryStorage = {
  list: listFiles,
  async read(workspacePath, path) {
    const target = safeWorkspacePath(workspacePath, path).target;
    const [content, metadata] = await Promise.all([readFile(target, "utf8"), stat(target)]);
    return { path, content, updatedAt: metadata.mtimeMs };
  },
  writeAtomic,
};

const storyProjectApi = createStoryProjectApi(nodeStoryStorage);

export const createNodeStoryToolRepository = (workspacePath: string): StoryToolRepository => ({
  project: storyProjectApi.workspace(workspacePath),
});
