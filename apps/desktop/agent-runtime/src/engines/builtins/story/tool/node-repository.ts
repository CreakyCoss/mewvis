import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { STORY_PROJECT_MANIFEST_PATH, storyProjectFiles, type StoryProjectFileEntry } from "./project.js";
import { assembleStoryProject, parseStoryProjectFile } from "./change-set.js";
import { decodeStoryDocument, encodeStoryDocument } from "./contract.js";
import { storyManifestFileSchema, type StoryProject } from "./schema.js";
import { validateStoryProject } from "./validation.js";
import type { StoryProjectRepository } from "./repository.js";

const jsonText = (value: unknown) => JSON.stringify(value, null, 2);

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

const readJson = async (workspacePath: string, path: string) => {
  const target = safeWorkspacePath(workspacePath, path).target;
  return JSON.parse(await readFile(target, "utf8")) as unknown;
};

const loadProject = async (workspacePath: string): Promise<StoryProject> => {
  const manifest = storyManifestFileSchema.parse(
    decodeStoryDocument(await readJson(workspacePath, STORY_PROJECT_MANIFEST_PATH), STORY_PROJECT_MANIFEST_PATH),
  );
  const contentEntries = await Promise.all(
    manifest.files.map(async (file): Promise<StoryProjectFileEntry> => ({
      path: file.path,
      value: parseStoryProjectFile(decodeStoryDocument(await readJson(workspacePath, file.path), file.path)),
    })),
  );
  const project = assembleStoryProject([{ path: STORY_PROJECT_MANIFEST_PATH, value: manifest }, ...contentEntries]);
  const validation = validateStoryProject(project, "draft");
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => `${issue.path}：${issue.message}`).join("\n"));
  }
  return project;
};

const collectJsonFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        return collectJsonFiles(root, path);
      }
      return entry.isFile() && entry.name.endsWith(".json") ? [relative(root, path).replace(/\\/g, "/")] : [];
    }),
  );
  return paths.flat();
};

const inspectProject = async (workspacePath: string) => {
  const jsonPaths = (await collectJsonFiles(join(workspacePath, "story")))
    .map((path) => `story/${path}`)
    .filter((path) => path !== "story/tavern.json" && !path.startsWith("story/runtime/"))
    .sort();
  return {
    initialized: jsonPaths.includes(STORY_PROJECT_MANIFEST_PATH),
    jsonPaths,
  };
};

const canonicalChangedPath = (path: string) =>
  path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const writeProject = async (workspacePath: string, project: StoryProject, changedPaths: string[]) => {
  const contentFiles = storyProjectFiles(project);
  const changedPathSet = new Set(changedPaths.map(canonicalChangedPath));
  const writeEntries = [
    ...contentFiles
      .filter(({ path }) => changedPathSet.has(path))
      .map(({ path, value }) => ({ path, content: `${jsonText(encodeStoryDocument(value, path))}\n` })),
    {
      path: STORY_PROJECT_MANIFEST_PATH,
      content: `${jsonText(encodeStoryDocument(project.manifest, STORY_PROJECT_MANIFEST_PATH))}\n`,
    },
  ];
  const nextPaths = new Set([STORY_PROJECT_MANIFEST_PATH, ...contentFiles.map((entry) => entry.path)]);
  const existingStoryFiles = await collectJsonFiles(join(workspacePath, "story"));
  const deletePaths = existingStoryFiles
    .map((path) => `story/${path}`)
    .filter((path) => !nextPaths.has(path) && path !== "story/tavern.json" && !path.startsWith("story/runtime/"));
  const transactionRoot = join(workspacePath, `.novel-claw-story-${randomUUID()}`);
  const stagedRoot = join(transactionRoot, "staged");
  const backupRoot = join(transactionRoot, "backup");
  const touchedPaths = [...new Set([...writeEntries.map((entry) => entry.path), ...deletePaths])];
  const applied: string[] = [];

  try {
    for (const entry of writeEntries) {
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
    for (const entry of writeEntries) {
      const target = safeWorkspacePath(workspacePath, entry.path).target;
      const staged = safeWorkspacePath(stagedRoot, entry.path).target;
      await mkdir(dirname(target), { recursive: true });
      await rm(target, { force: true });
      await rename(staged, target);
      applied.push(entry.path);
    }
    for (const path of deletePaths) {
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

export const createNodeStoryProjectRepository = (workspacePath: string): StoryProjectRepository => ({
  inspect: () => inspectProject(workspacePath),
  load: () => loadProject(workspacePath),
  initialize: async (project, replaceExistingJson) => {
    const status = await inspectProject(workspacePath);
    if (status.initialized) {
      throw new Error("故事工具结构已经初始化。请读取上下文后使用增量提交。");
    }
    if (status.jsonPaths.length > 0 && !replaceExistingJson) {
      throw new Error("story 目录已有 JSON，未获准替换。所有正式文件均保持不变。");
    }
    await writeProject(
      workspacePath,
      project,
      storyProjectFiles(project).map((entry) => entry.path),
    );
  },
  writeChanges: (project, changedPaths) => writeProject(workspacePath, project, changedPaths),
});
