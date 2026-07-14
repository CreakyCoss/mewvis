import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFilesAtomic,
} from "../../../src/features/pages/workspace/files-api.js";
import { STORY_PROJECT_IDENTIFIERS } from "../identifiers.js";
import {
  compileStoryProjectWorkspace,
  createStoryProjectLock,
  STORY_PROJECT_CONFIG_PATH,
  STORY_PROJECT_LOCK_PATH,
  STORY_PROJECT_PROFILE_PATH,
} from "./metadata.js";
import type { StoryProjectApi } from "../api.js";
import { createStoryProjectCompilerRegistry } from "./registry.js";
import { DECLARATIVE_STORY_PROJECT_COMPILER } from "../compiler/compiler.js";
import { LONG_NOVEL_STORY_TYPE } from "../story-types/long-novel/index.js";
import { resolveStoryProjectType } from "../story-types/index.js";

const compilers = createStoryProjectCompilerRegistry([DECLARATIVE_STORY_PROJECT_COMPILER]);

const serializedContent = (value: ReturnType<StoryProjectApi["encodeDocument"]>) =>
  typeof value === "string" ? `${value.replace(/\s+$/, "")}\n` : `${JSON.stringify(value, null, 2)}\n`;

const sha256 = async (content: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
};

const lockText = async (projectText: string, profileText: string, project: StoryProjectApi) =>
  `${JSON.stringify(
    createStoryProjectLock(project, {
      projectSha256: await sha256(projectText),
      profileSha256: await sha256(profileText),
    }),
    null,
    2,
  )}\n`;

const installStoryProject = async (
  workspacePath: string,
  layout: unknown,
  profile: unknown,
  compilerId = STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format,
) => {
  const compiled = compilers.compile(compilerId, { profile, layout });
  const projectText = `${JSON.stringify(layout, null, 2)}\n`;
  const profileText = `${JSON.stringify(profile, null, 2)}\n`;
  await writeWorkspaceFilesAtomic(workspacePath, [
    { relativePath: STORY_PROJECT_CONFIG_PATH, content: projectText },
    { relativePath: STORY_PROJECT_PROFILE_PATH, content: profileText },
    { relativePath: STORY_PROJECT_LOCK_PATH, content: await lockText(projectText, profileText, compiled) },
  ]);
  return compiled;
};

const installDefaultStoryProject = (workspacePath: string) =>
  installStoryProject(workspacePath, LONG_NOVEL_STORY_TYPE.layout, LONG_NOVEL_STORY_TYPE.profile);

export const createStoryProject = async (
  workspacePath: string,
  input: { storyTypeId: string; storyId: string; title: string },
) => {
  const storyType = resolveStoryProjectType(input.storyTypeId);
  const projectApi = await installStoryProject(workspacePath, storyType.layout, storyType.profile);
  const project = storyType.initialize(projectApi, projectApi.createProject(input));
  const validation = projectApi.validateProject(project, "draft");
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => `${issue.path}：${issue.message}`).join("\n"));
  }
  const manifestPath = projectApi.projectManifestPath();
  const files = [
    ...projectApi.projectFiles(project).map(({ path, value }) => ({
      relativePath: path,
      content: serializedContent(projectApi.encodeDocument(value, path)),
    })),
    {
      relativePath: manifestPath,
      content: serializedContent(projectApi.encodeDocument(projectApi.projectManifest(project), manifestPath)),
    },
  ];
  await writeWorkspaceFilesAtomic(workspacePath, files);
  return projectApi;
};

export const loadStoryProjectApi = async (workspacePath: string): Promise<StoryProjectApi> => {
  const entries = await listWorkspaceFiles(workspacePath);
  const paths = new Set(entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path));
  if (!paths.has(STORY_PROJECT_CONFIG_PATH)) return installDefaultStoryProject(workspacePath);
  if (!paths.has(STORY_PROJECT_PROFILE_PATH))
    throw new Error(`故事项目缺少 Profile 快照：${STORY_PROJECT_PROFILE_PATH}`);
  if (!paths.has(STORY_PROJECT_LOCK_PATH)) throw new Error(`故事项目缺少锁文件：${STORY_PROJECT_LOCK_PATH}`);
  try {
    const [projectFile, profileFile, lockFile] = await Promise.all([
      readWorkspaceFile(workspacePath, STORY_PROJECT_CONFIG_PATH),
      readWorkspaceFile(workspacePath, STORY_PROJECT_PROFILE_PATH),
      readWorkspaceFile(workspacePath, STORY_PROJECT_LOCK_PATH),
    ]);
    return compileStoryProjectWorkspace(compilers, {
      layout: JSON.parse(projectFile.content) as unknown,
      profile: JSON.parse(profileFile.content) as unknown,
      lock: JSON.parse(lockFile.content) as unknown,
      projectSha256: await sha256(projectFile.content),
      profileSha256: await sha256(profileFile.content),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`故事项目配置无效：${message}`);
  }
};
