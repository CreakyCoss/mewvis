import { STORY_PROJECT_IDENTIFIERS } from "../identifiers.js";
import type { StoryProjectApi, StoryProjectCompilerRegistry } from "../api.js";

export const STORY_PROJECT_CONFIG_PATH = "story/.novel-claw/project.json" as const;
export const STORY_PROJECT_PROFILE_PATH = "story/.novel-claw/profile.json" as const;
export const STORY_PROJECT_LOCK_PATH = "story/.novel-claw/project.lock.json" as const;

type StoryProjectDigests = Readonly<{
  projectSha256: string;
  profileSha256: string;
}>;

const objectValue = (value: unknown, owner: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${owner} 必须是 JSON 对象。`);
  return value as Record<string, unknown>;
};

export const createStoryProjectLock = (
  projectApi: StoryProjectApi,
  digests: StoryProjectDigests,
): Record<string, unknown> => ({
  $format: STORY_PROJECT_IDENTIFIERS.projectLock.format,
  version: STORY_PROJECT_IDENTIFIERS.projectLock.version,
  projectPath: STORY_PROJECT_CONFIG_PATH,
  profilePath: STORY_PROJECT_PROFILE_PATH,
  profileId: projectApi.identity.profileId,
  profileVersion: projectApi.identity.profileVersion,
  compiler: projectApi.compiler,
  ...digests,
});

export const compileStoryProjectWorkspace = (
  compilers: StoryProjectCompilerRegistry,
  input: Readonly<{
    layout: unknown;
    profile: unknown;
    lock: unknown;
  }> &
    StoryProjectDigests,
): StoryProjectApi => {
  const lock = objectValue(input.lock, "故事项目锁文件");
  const compiler = objectValue(lock.compiler, "故事项目锁文件 compiler");
  if (typeof compiler.format !== "string") throw new Error("故事项目锁文件缺少 Compiler 身份。");
  const projectApi = compilers.compile(compiler.format, { layout: input.layout, profile: input.profile });
  if (
    lock.$format !== STORY_PROJECT_IDENTIFIERS.projectLock.format ||
    lock.version !== STORY_PROJECT_IDENTIFIERS.projectLock.version ||
    lock.projectPath !== STORY_PROJECT_CONFIG_PATH ||
    lock.profilePath !== STORY_PROJECT_PROFILE_PATH ||
    lock.profileId !== projectApi.identity.profileId ||
    lock.profileVersion !== projectApi.identity.profileVersion ||
    compiler.version !== projectApi.compiler.version ||
    lock.projectSha256 !== input.projectSha256 ||
    lock.profileSha256 !== input.profileSha256
  ) {
    throw new Error("project.lock.json 与故事项目配置不一致。");
  }
  return projectApi;
};
