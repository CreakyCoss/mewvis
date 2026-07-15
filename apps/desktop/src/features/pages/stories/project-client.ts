import { createStoryProjectApi } from "../../../../core/story-project";
import type { StoryStorage } from "../../../../core/story-project/types";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFilesAtomic } from "../workspace/files-api";

const desktopStoryStorage: StoryStorage = {
  list: (workspacePath) => listWorkspaceFiles(workspacePath),
  read: (workspacePath, path) => readWorkspaceFile(workspacePath, path),
  writeAtomic: (workspacePath, writes, deletes = []) =>
    writeWorkspaceFilesAtomic(
      workspacePath,
      writes.map(({ path, content }) => ({ relativePath: path, content })),
      [...deletes],
    ).then(() => undefined),
};

export const storyProjectApi = createStoryProjectApi(desktopStoryStorage);
