import { createStoryProjectApi } from "../../../../core/story-project";
import { createStoryFileStorage, type StoryFileBackend } from "../../../../core/story-project/storage/adapters/file";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFilesAtomic } from "../workspace/files-api";

const desktopStoryFileBackend: StoryFileBackend = {
  list: (workspacePath) => listWorkspaceFiles(workspacePath),
  read: (workspacePath, path) => readWorkspaceFile(workspacePath, path),
  writeAtomic: (workspacePath, writes, deletes, revision) =>
    writeWorkspaceFilesAtomic(
      workspacePath,
      writes.map(({ path, content }) => ({ relativePath: path, content })),
      [...deletes],
      { relativePath: revision.key, expectedRevision: revision.expected },
    ).then(() => undefined),
};

export const storyProjectApi = createStoryProjectApi(createStoryFileStorage(desktopStoryFileBackend));
