import { readJsonWorkspaceFile, writeJsonWorkspaceFilesAtomic } from "@/utils/files";
import { listWorkspaceFiles } from "@/features/pages/workspace/files-api";
import { assembleStoryProject, parseStoryProjectFile } from "./change-set.js";
import { decodeStoryDocument, encodeStoryDocument } from "@agent-runtime/engines/builtins/story/tool/contract";
import {
  STORY_PROJECT_MANIFEST_PATH,
  STORY_PROJECT_ROOT,
  storyProjectFiles,
  withRebuiltManifest,
  type StoryProjectFileEntry,
} from "./project.js";
import { storyManifestFileSchema, type StoryProject } from "./schema.js";
import { assertValidStoryProject, type StoryValidationProfile } from "./validation.js";

const protectedStoryPaths = new Set([`${STORY_PROJECT_ROOT}/tavern.json`]);

export const loadStoryProject = async (workspacePath: string): Promise<StoryProject> => {
  const manifestValue = await readJsonWorkspaceFile(workspacePath, STORY_PROJECT_MANIFEST_PATH);
  const manifestResult = storyManifestFileSchema.safeParse(
    decodeStoryDocument(manifestValue, STORY_PROJECT_MANIFEST_PATH),
  );
  if (!manifestResult.success) {
    throw new Error("故事缺少有效的 story/manifest.json；旧 story.json 格式已不再支持。");
  }
  const manifest = manifestResult.data;
  const contentEntries = await Promise.all(
    manifest.files.map(async (file): Promise<StoryProjectFileEntry> => {
      const value = await readJsonWorkspaceFile(workspacePath, file.path);
      if (value === null) {
        throw new Error(`故事清单引用的文件不存在或不是有效 JSON：${file.path}`);
      }
      const parsed = parseStoryProjectFile(decodeStoryDocument(value, file.path));
      if (parsed.kind !== file.kind || ("id" in parsed ? parsed.id : parsed.storyId) !== file.id) {
        throw new Error(`故事文件与 manifest 声明不一致：${file.path}`);
      }
      return { path: file.path, value: parsed };
    }),
  );
  const project = assembleStoryProject([{ path: STORY_PROJECT_MANIFEST_PATH, value: manifest }, ...contentEntries]);
  return assertValidStoryProject(project, "draft");
};

export const saveStoryProject = async (
  workspacePath: string,
  input: StoryProject,
  profile: StoryValidationProfile = "draft",
): Promise<StoryProject> => {
  const persistedManifestValue = await readJsonWorkspaceFile(workspacePath, STORY_PROJECT_MANIFEST_PATH);
  const persistedManifest =
    persistedManifestValue === null
      ? null
      : storyManifestFileSchema.parse(decodeStoryDocument(persistedManifestValue, STORY_PROJECT_MANIFEST_PATH));
  if (persistedManifest && input.manifest.revision !== persistedManifest.revision + 1) {
    throw new Error(
      `故事已被其他操作更新：当前 revision ${persistedManifest.revision}，待保存版本应为 ${persistedManifest.revision + 1}。`,
    );
  }
  const project = withRebuiltManifest(input, {
    revision: input.manifest.revision,
    timestamp: input.manifest.updatedAt,
  });
  assertValidStoryProject(project, profile);

  const contentFiles = storyProjectFiles(project);
  const nextPaths = new Set([STORY_PROJECT_MANIFEST_PATH, ...contentFiles.map((file) => file.path)]);
  const existingFiles = await listWorkspaceFiles(workspacePath);
  const deletePaths = existingFiles.flatMap((file) => {
    if (
      file.isDirectory ||
      !file.path.startsWith(`${STORY_PROJECT_ROOT}/`) ||
      !file.path.endsWith(".json") ||
      nextPaths.has(file.path) ||
      protectedStoryPaths.has(file.path) ||
      file.path.startsWith(`${STORY_PROJECT_ROOT}/runtime/`)
    ) {
      return [];
    }
    return [file.path];
  });

  await writeJsonWorkspaceFilesAtomic(
    workspacePath,
    [
      ...contentFiles.map(({ path, value }) => ({ relativePath: path, value: encodeStoryDocument(value, path) })),
      {
        relativePath: STORY_PROJECT_MANIFEST_PATH,
        value: encodeStoryDocument(project.manifest, STORY_PROJECT_MANIFEST_PATH),
      },
    ],
    deletePaths,
  );
  return project;
};
