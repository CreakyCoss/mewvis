import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernMessage } from "./model/message";
import { readJsonWorkspaceFile, writeJsonWorkspaceFile } from "@/utils/files";

const TAVERN_MESSAGES_FILE_NAME = "messages.json";
const TAVERN_WORKSPACE_PATH_MARKER = "/.tavern/";
const TAVERN_WORKSPACE_INIT_FILE_PREFIX = ".__tavern_workspace_init";
const ensuredRoomPaths = new Set<string>();

type TavernRoomFiles = {
  messages: TavernMessage[];
};

const normalizePathSeparators = (value: string) => value.trim().replace(/\\/g, "/").replace(/\/+$/, "");

const resolveTavernWorkspaceBackingPath = (workspacePath: string) => {
  const normalizedPath = normalizePathSeparators(workspacePath);
  const markerIndex = normalizedPath.lastIndexOf(TAVERN_WORKSPACE_PATH_MARKER);
  if (markerIndex <= 0) {
    return null;
  }

  return {
    workspacePath: normalizedPath.slice(0, markerIndex),
    relativePath: normalizedPath.slice(markerIndex + 1),
  };
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
      input: { workspacePath, relativePath },
    });
  } catch {
    // A missing file already represents an empty room.
  }
};

const ensureTavernRoomDirectory = async (workspacePath: string) => {
  if (!workspacePath.trim() || !isTauri()) {
    return;
  }

  const normalizedPath = normalizePathSeparators(workspacePath);
  if (ensuredRoomPaths.has(normalizedPath)) {
    return;
  }

  const backingPath = resolveTavernWorkspaceBackingPath(workspacePath);
  if (!backingPath) {
    ensuredRoomPaths.add(normalizedPath);
    return;
  }

  const initFileName = `${TAVERN_WORKSPACE_INIT_FILE_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  const initFilePath = `${backingPath.relativePath}/${initFileName}`;
  await writeTextWorkspaceFile(backingPath.workspacePath, initFilePath, "");
  await deleteWorkspaceFileIfExists(backingPath.workspacePath, initFilePath);
  ensuredRoomPaths.add(normalizedPath);
};

export const loadTavernRoom = async (workspacePath: string): Promise<TavernRoomFiles | null> => {
  if (!workspacePath.trim() || !isTauri()) {
    return null;
  }

  const messages = await readJsonWorkspaceFile<TavernMessage[]>(workspacePath, TAVERN_MESSAGES_FILE_NAME);
  if (!messages) {
    return null;
  }

  return { messages };
};

export const saveTavernRoom = async (workspacePath: string, messages: TavernMessage[]) => {
  if (!workspacePath.trim() || !isTauri()) {
    return;
  }

  await ensureTavernRoomDirectory(workspacePath);
  await writeJsonWorkspaceFile(workspacePath, TAVERN_MESSAGES_FILE_NAME, messages);
};

export const deleteTavernRoom = async (workspacePath: string) => {
  if (!workspacePath.trim() || !isTauri()) {
    return;
  }

  await deleteWorkspaceFileIfExists(workspacePath, TAVERN_MESSAGES_FILE_NAME);
};
