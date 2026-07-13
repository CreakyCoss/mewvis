import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  STORY_PROJECT_IDENTIFIERS,
  STORY_PROJECT_CONFIG_PATH,
  STORY_PROJECT_LOCK_PATH,
  STORY_PROJECT_PROFILE_PATH,
  createStoryProjectCompilerRegistry,
  type StoryProjectApi,
  type CompiledStoryProjectFileEntry,
  type StoryCompiledProject,
  type StoryProjectCompilerRegistry,
} from "../../../../../../protocols/story-project/index.js";
import type { StoryToolRepository } from "./repository.js";

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

const readStoryValue = async (workspacePath: string, path: string) => {
  const text = await readFile(safeWorkspacePath(workspacePath, path).target, "utf8");
  return path.endsWith(".md") ? text : (JSON.parse(text) as unknown);
};

const loadProjectApi = async (workspacePath: string, compilers: StoryProjectCompilerRegistry) => {
  const projectTarget = safeWorkspacePath(workspacePath, STORY_PROJECT_CONFIG_PATH).target;
  const profileTarget = safeWorkspacePath(workspacePath, STORY_PROJECT_PROFILE_PATH).target;
  const [projectText, profileText, lockInput] = await Promise.all([
    readFile(projectTarget, "utf8"),
    readFile(profileTarget, "utf8"),
    readJson(workspacePath, STORY_PROJECT_LOCK_PATH),
  ]);
  if (!lockInput || typeof lockInput !== "object" || Array.isArray(lockInput)) {
    throw new Error("故事项目锁文件必须是 JSON 对象。");
  }
  const lock = lockInput as Record<string, unknown>;
  const compiler = lock.compiler as Record<string, unknown> | undefined;
  if (typeof compiler?.format !== "string") throw new Error("故事项目锁文件缺少 Compiler 身份。 ");
  const projectApi = compilers.compile(compiler.format, {
    layout: JSON.parse(projectText) as unknown,
    profile: JSON.parse(profileText) as unknown,
  });
  const projectDigest = createHash("sha256").update(projectText).digest("hex");
  const profileDigest = createHash("sha256").update(profileText).digest("hex");
  if (
    lock.$format !== STORY_PROJECT_IDENTIFIERS.projectLock.format ||
    lock.version !== STORY_PROJECT_IDENTIFIERS.projectLock.version ||
    lock.projectPath !== STORY_PROJECT_CONFIG_PATH ||
    lock.profilePath !== STORY_PROJECT_PROFILE_PATH ||
    lock.profileId !== projectApi.identity.profileId ||
    lock.profileVersion !== projectApi.identity.profileVersion ||
    compiler?.version !== projectApi.compiler.version ||
    lock.projectSha256 !== projectDigest ||
    lock.profileSha256 !== profileDigest
  ) {
    throw new Error("project.lock.json 与故事项目配置不一致。 ");
  }
  return projectApi;
};

const loadProject = async (workspacePath: string, projectApi: StoryProjectApi) => {
  const manifestPath = projectApi.projectManifestPath();
  const manifest = projectApi.parseManifest(
    projectApi.decodeDocument(await readStoryValue(workspacePath, manifestPath), manifestPath),
  );
  const contentEntries = await Promise.all(
    manifest.files.map(async (file): Promise<CompiledStoryProjectFileEntry> => ({
      path: file.path,
      value: projectApi.decodeDocument(await readStoryValue(workspacePath, file.path), file.path),
    })),
  );
  const project = projectApi.assembleProject([{ path: manifestPath, value: manifest.value }, ...contentEntries]);
  const validation = projectApi.validateProject(project, "draft");
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => `${issue.path}：${issue.message}`).join("\n"));
  }
  return project;
};

const collectStoryFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        return collectStoryFiles(root, path);
      }
      return entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".md"))
        ? [relative(root, path).replace(/\\/g, "/")]
        : [];
    }),
  );
  return paths.flat();
};

const inspectProject = async (workspacePath: string, projectApi: StoryProjectApi) => {
  const manifestPath = projectApi.projectManifestPath();
  const jsonPaths = (await collectStoryFiles(join(workspacePath, "story")))
    .map((path) => `story/${path}`)
    .filter(
      (path) =>
        path !== "story/tavern.json" && !path.startsWith("story/runtime/") && !path.startsWith("story/.novel-claw/"),
    )
    .sort();
  return {
    initialized: jsonPaths.includes(manifestPath),
    jsonPaths,
  };
};

const canonicalChangedPath = (path: string) =>
  path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const writeProject = async (
  workspacePath: string,
  projectApi: StoryProjectApi,
  project: StoryCompiledProject,
  changedPaths: string[],
) => {
  const manifestPath = projectApi.projectManifestPath();
  const contentFiles = projectApi.projectFiles(project);
  const manifest = projectApi.projectManifest(project);
  const changedPathSet = new Set(changedPaths.map(canonicalChangedPath));
  const writeEntries = [
    ...contentFiles
      .filter(({ path }) => changedPathSet.has(path))
      .map(({ path, value }) => {
        const encoded = projectApi.encodeDocument(value, path);
        return {
          path,
          content: typeof encoded === "string" ? `${encoded.replace(/\s+$/, "")}\n` : `${jsonText(encoded)}\n`,
        };
      }),
    {
      path: manifestPath,
      content: `${jsonText(projectApi.encodeDocument(manifest, manifestPath))}\n`,
    },
  ];
  const nextPaths = new Set([manifestPath, ...contentFiles.map((entry) => entry.path)]);
  const existingStoryFiles = await collectStoryFiles(join(workspacePath, "story"));
  const deletePaths = existingStoryFiles
    .map((path) => `story/${path}`)
    .filter(
      (path) =>
        !nextPaths.has(path) &&
        path !== "story/tavern.json" &&
        !path.startsWith("story/runtime/") &&
        !path.startsWith("story/.novel-claw/"),
    );
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

export const createNodeStoryToolRepository = (
  workspacePath: string,
  compilers: StoryProjectCompilerRegistry = createStoryProjectCompilerRegistry(),
): StoryToolRepository => ({
  loadProjectApi: () => loadProjectApi(workspacePath, compilers),
  inspect: (projectApi) => inspectProject(workspacePath, projectApi),
  load: (projectApi) => loadProject(workspacePath, projectApi),
  initialize: async (projectApi, project, replaceExistingJson) => {
    const status = await inspectProject(workspacePath, projectApi);
    if (status.initialized) {
      throw new Error("故事工具结构已经初始化。请读取上下文后使用增量提交。");
    }
    if (status.jsonPaths.length > 0 && !replaceExistingJson) {
      throw new Error("story 目录已有 JSON，未获准替换。所有正式文件均保持不变。");
    }
    await writeProject(
      workspacePath,
      projectApi,
      project,
      projectApi.projectFiles(project).map((entry) => entry.path),
    );
  },
  writeChanges: (projectApi, project, changedPaths) => writeProject(workspacePath, projectApi, project, changedPaths),
});
