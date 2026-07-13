import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFilesAtomic } from "@/features/pages/workspace/files-api";
import {
  DECLARATIVE_STORY_PROJECT_COMPILER_ID,
  STORY_PROJECT_CONFIG_PATH,
  STORY_PROJECT_LOCK_PATH,
  STORY_PROJECT_PROFILE_PATH,
  createStoryProjectCompilerRegistry,
  type StoryProjectApi,
} from "../../../../../protocols/story-project";
import { DEFAULT_STORY_PROJECT_LAYOUT } from "./layouts/default-layout";
import { DEFAULT_STORY_PROFILE_SOURCE } from "./profiles/default-novel";

const compilers = createStoryProjectCompilerRegistry();

const serializedContent = (value: ReturnType<StoryProjectApi["encodeDocument"]>) =>
  typeof value === "string" ? `${value.replace(/\s+$/, "")}\n` : `${JSON.stringify(value, null, 2)}\n`;

const sha256 = async (content: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
};

const lockText = async (projectText: string, profileText: string, project: StoryProjectApi) =>
  `${JSON.stringify(
    {
      $format: "novel-claw.story-project-lock",
      version: 1,
      projectPath: STORY_PROJECT_CONFIG_PATH,
      profilePath: STORY_PROJECT_PROFILE_PATH,
      profileId: project.identity.profileId,
      profileVersion: project.identity.profileVersion,
      compiler: project.compiler,
      projectSha256: await sha256(projectText),
      profileSha256: await sha256(profileText),
    },
    null,
    2,
  )}\n`;

export const installStoryProject = async (
  workspacePath: string,
  layout: unknown,
  profile: unknown,
  compilerId = DECLARATIVE_STORY_PROJECT_COMPILER_ID,
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

export const installDefaultStoryProject = (workspacePath: string) =>
  installStoryProject(workspacePath, DEFAULT_STORY_PROJECT_LAYOUT, DEFAULT_STORY_PROFILE_SOURCE);

export const initializeDefaultStoryProject = async (
  workspacePath: string,
  input: { storyId: string; title: string },
) => {
  const projectApi = await installDefaultStoryProject(workspacePath);
  const project = projectApi.createProject(input);
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
  if (!paths.has(STORY_PROJECT_PROFILE_PATH)) throw new Error(`故事项目缺少 Profile 快照：${STORY_PROJECT_PROFILE_PATH}`);
  if (!paths.has(STORY_PROJECT_LOCK_PATH)) throw new Error(`故事项目缺少锁文件：${STORY_PROJECT_LOCK_PATH}`);
  try {
    const [projectFile, profileFile, lockFile] = await Promise.all([
      readWorkspaceFile(workspacePath, STORY_PROJECT_CONFIG_PATH),
      readWorkspaceFile(workspacePath, STORY_PROJECT_PROFILE_PATH),
      readWorkspaceFile(workspacePath, STORY_PROJECT_LOCK_PATH),
    ]);
    const lock = JSON.parse(lockFile.content) as Record<string, unknown>;
    const compiler = lock.compiler as Record<string, unknown> | undefined;
    if (typeof compiler?.format !== "string") throw new Error("项目锁文件缺少 Compiler 身份。 ");
    const project = compilers.compile(compiler.format, {
      layout: JSON.parse(projectFile.content) as unknown,
      profile: JSON.parse(profileFile.content) as unknown,
    });
    if (
      lock.$format !== "novel-claw.story-project-lock" ||
      lock.version !== 1 ||
      lock.projectPath !== STORY_PROJECT_CONFIG_PATH ||
      lock.profilePath !== STORY_PROJECT_PROFILE_PATH ||
      lock.profileId !== project.identity.profileId ||
      lock.profileVersion !== project.identity.profileVersion ||
      compiler.version !== project.compiler.version ||
      lock.projectSha256 !== (await sha256(projectFile.content)) ||
      lock.profileSha256 !== (await sha256(profileFile.content))
    ) {
      throw new Error("project.lock.json 与故事项目配置不一致。 ");
    }
    return project;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`故事项目配置无效：${message}`);
  }
};
