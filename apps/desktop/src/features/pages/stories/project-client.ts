import { BUILTIN_STORY_FILE_LAYOUT, createStoryProjectApi } from "../../../../core/story-project";
import { createStoryProjectStorage } from "../../../../core/story-project/storage";
import type { StoryFileBackend } from "../../../../core/story-project/storage/types";
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  readWorkspaceFileOptional,
  writeWorkspaceFilesAtomic,
} from "../workspace/files-api";

const desktopStoryFileBackend: StoryFileBackend = {
  list: (workspacePath) => listWorkspaceFiles(workspacePath),
  read: (workspacePath, path) => readWorkspaceFile(workspacePath, path),
  readOptional: (workspacePath, path) => readWorkspaceFileOptional(workspacePath, path),
  writeAtomic: (workspacePath, writes, deletes, revision) =>
    writeWorkspaceFilesAtomic(
      workspacePath,
      writes.map(({ path, content }) => ({ relativePath: path, content })),
      [...deletes],
      { relativePath: revision.key, expectedRevision: revision.expected },
    ).then(() => undefined),
};

export const storyProjectApi = createStoryProjectApi(
  createStoryProjectStorage({ kind: "file", backend: desktopStoryFileBackend, layout: BUILTIN_STORY_FILE_LAYOUT }),
);
