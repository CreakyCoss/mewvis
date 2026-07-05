import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  createStoryManuscriptsManifest,
  storyManuscriptContentPath,
  storyManuscriptMetaPath,
  storyManuscriptToMeta,
} from "./model/operations";
import {
  normalizeStoryManuscript,
  normalizeStoryManuscriptMeta,
  normalizeStoryManuscriptsManifest,
} from "./model/normalizer";
import type { StoryManuscript } from "./model/types";

const MANUSCRIPTS_MANIFEST_FILE = "manuscripts/manifest.json";
const STORY_MANUSCRIPTS_STORAGE_PREFIX = "novel-claw:story:manuscripts";

const storyManuscriptsStorageKey = (storyId: string) => `${STORY_MANUSCRIPTS_STORAGE_PREFIX}:${storyId}`;

const readJsonWorkspaceFile = async (workspacePath: string, relativePath: string): Promise<unknown | null> => {
  try {
    const file = await invoke<{ content: string }>("read_workspace_file", {
      input: { workspacePath, relativePath },
    });
    return JSON.parse(file.content);
  } catch {
    return null;
  }
};

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

const writeJsonWorkspaceFile = async (workspacePath: string, relativePath: string, value: unknown) => {
  await writeTextWorkspaceFile(workspacePath, relativePath, JSON.stringify(value, null, 2));
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

const loadStoryManuscriptsFromLocalStorage = (storyId: string): StoryManuscript[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storyManuscriptsStorageKey(storyId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          const meta = normalizeStoryManuscriptMeta(item);
          const content = isRecord(item) && typeof item.content === "string" ? item.content : "";
          return meta ? [{ ...meta, content }] : [];
        })
      : [];
  } catch {
    return [];
  }
};

const saveStoryManuscriptsToLocalStorage = (storyId: string, manuscripts: StoryManuscript[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storyManuscriptsStorageKey(storyId), JSON.stringify(manuscripts));
};

export const removeStoryManuscriptsFromLocalStorage = (storyId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storyManuscriptsStorageKey(storyId));
};

export const loadStoryManuscripts = async (workspacePath: string, storyId: string): Promise<StoryManuscript[]> => {
  if (!isTauri()) {
    return loadStoryManuscriptsFromLocalStorage(storyId);
  }

  const manifest = normalizeStoryManuscriptsManifest(
    await readJsonWorkspaceFile(workspacePath, MANUSCRIPTS_MANIFEST_FILE),
    storyId,
  );
  const manuscriptRefs = manifest.nodes.flatMap((node) => [
    ...node.pendingIds.map((id) => ({ id, nodeId: node.nodeId, status: "pending" as const })),
    ...node.acceptedIds.map((id) => ({ id, nodeId: node.nodeId, status: "accepted" as const })),
    ...node.rejectedIds.map((id) => ({ id, nodeId: node.nodeId, status: "rejected" as const })),
  ]);

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
    saveStoryManuscriptsToLocalStorage(storyId, normalized);
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
