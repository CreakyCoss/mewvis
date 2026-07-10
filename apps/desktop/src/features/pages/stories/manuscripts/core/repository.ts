import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  createStoryManuscriptsManifest,
  MANUSCRIPTS_MANIFEST_FILE,
  storyManuscriptContentPath,
  storyManuscriptMetaPath,
  storyManuscriptToMeta,
} from "./file-layout";
import {
  normalizeStoryManuscript,
  normalizeStoryManuscriptMeta,
  normalizeStoryManuscriptsManifest,
} from "../model/normalizer";
import { storyManuscriptStatusOptions } from "../model/status";
import type { StoryManuscript } from "../model/types";
import { readJsonWorkspaceFile, writeJsonWorkspaceFile } from "@/utils/files";

const readTextWorkspaceFile = async (workspacePath: string, relativePath: string): Promise<string> => {
  try {
    const file = await invoke<{ content: string }>("read_workspace_file", {
      input: { workspacePath, relativePath },
    });
    return file.content;
  } catch {
    return "";
  }
};

const writeTextWorkspaceFile = async (workspacePath: string, relativePath: string, content: string) => {
  await invoke("write_workspace_file", {
    input: {
      workspacePath,
      relativePath,
      content,
    },
  });
};

const deleteWorkspaceFileIfExists = async (workspacePath: string, relativePath: string) => {
  try {
    await invoke("delete_workspace_file", {
      input: {
        workspacePath,
        relativePath,
      },
    });
  } catch {
    // Missing files are harmless during status moves.
  }
};

export const loadStoryManuscripts = async (workspacePath: string, storyId: string): Promise<StoryManuscript[]> => {
  if (!isTauri()) {
    return [];
  }

  const manifest = normalizeStoryManuscriptsManifest(
    await readJsonWorkspaceFile(workspacePath, MANUSCRIPTS_MANIFEST_FILE),
    storyId,
  );
  const manuscriptRefs = manifest.nodes.flatMap((node) =>
    storyManuscriptStatusOptions.flatMap(({ manifestIdsKey, status }) =>
      node[manifestIdsKey].map((id) => ({ id, nodeId: node.nodeId, status })),
    ),
  );

  const manuscripts = await Promise.all(
    manuscriptRefs.map(async (ref) => {
      const meta = await readJsonWorkspaceFile(workspacePath, storyManuscriptMetaPath(ref));
      const normalizedMeta = normalizeStoryManuscriptMeta(meta);
      if (!normalizedMeta) {
        return null;
      }
      const content = await readTextWorkspaceFile(workspacePath, normalizedMeta.contentPath);
      return normalizeStoryManuscript(normalizedMeta, content);
    }),
  );

  return manuscripts.flatMap((item) => (item ? [item] : []));
};

export const persistStoryManuscripts = async (
  workspacePath: string,
  storyId: string,
  manuscripts: StoryManuscript[],
) => {
  const normalized = manuscripts.map((manuscript) => ({
    ...manuscript,
    contentPath: storyManuscriptContentPath(manuscript),
  }));

  if (!isTauri()) {
    return normalized;
  }

  const previousManuscripts = await loadStoryManuscripts(workspacePath, storyId);
  const nextFileKeys = new Set(
    normalized.flatMap((manuscript) => [storyManuscriptMetaPath(manuscript), manuscript.contentPath]),
  );

  await Promise.all(
    previousManuscripts.flatMap((manuscript) => {
      const paths = [storyManuscriptMetaPath(manuscript), manuscript.contentPath];
      return paths
        .filter((path) => !nextFileKeys.has(path))
        .map((path) => deleteWorkspaceFileIfExists(workspacePath, path));
    }),
  );

  await Promise.all(
    normalized.flatMap((manuscript) => [
      writeJsonWorkspaceFile(workspacePath, storyManuscriptMetaPath(manuscript), storyManuscriptToMeta(manuscript)),
      writeTextWorkspaceFile(workspacePath, manuscript.contentPath, manuscript.content),
    ]),
  );
  await writeJsonWorkspaceFile(
    workspacePath,
    MANUSCRIPTS_MANIFEST_FILE,
    createStoryManuscriptsManifest(storyId, normalized),
  );

  return normalized;
};
