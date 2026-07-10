import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernMessage } from "../tavern/types";
import type { TavernRoomRuntime, TavernRoomSessionState } from "./model";

const TAVERN_ROOM_FILE_NAME = "room.json";
const TAVERN_MESSAGES_FILE_NAME = "messages.json";
const TAVERN_WORKSPACE_PATH_MARKER = "/.tavern/";
const TAVERN_WORKSPACE_INIT_FILE_PREFIX = ".__tavern_workspace_init";
const ensuredSessionPaths = new Set<string>();

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

const readJsonWorkspaceFile = async <T>(workspacePath: string, relativePath: string): Promise<T | null> => {
  let content: string;
  try {
    const file = await invoke<{ content: string }>("read_workspace_file", {
      input: { workspacePath, relativePath },
    });
    content = file.content;
  } catch {
    return null;
  }

  return JSON.parse(content) as T;
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
      input: { workspacePath, relativePath },
    });
  } catch {
    // Missing runtime files are already equivalent to a cleared room session.
  }
};

const ensureTavernRoomSessionDirectory = async (workspacePath: string) => {
  if (!workspacePath.trim() || !isTauri()) {
    return;
  }

  const normalizedPath = normalizePathSeparators(workspacePath);
  if (ensuredSessionPaths.has(normalizedPath)) {
    return;
  }

  const backingPath = resolveTavernWorkspaceBackingPath(workspacePath);
  if (!backingPath) {
    ensuredSessionPaths.add(normalizedPath);
    return;
  }

  const initFileName = `${TAVERN_WORKSPACE_INIT_FILE_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  const initFilePath = `${backingPath.relativePath}/${initFileName}`;
  await writeTextWorkspaceFile(backingPath.workspacePath, initFilePath, "");
  await deleteWorkspaceFileIfExists(backingPath.workspacePath, initFilePath);
  ensuredSessionPaths.add(normalizedPath);
};

export const loadTavernRoomSessionState = async (workspacePath: string): Promise<TavernRoomSessionState | null> => {
  if (!workspacePath.trim() || !isTauri()) {
    return null;
  }

  const runtime = await readJsonWorkspaceFile<TavernRoomRuntime>(workspacePath, TAVERN_ROOM_FILE_NAME);
  const messages = await readJsonWorkspaceFile<TavernMessage[]>(workspacePath, TAVERN_MESSAGES_FILE_NAME);
  if (!runtime || !messages) {
    return null;
  }

  return {
    runtime,
    messages,
  };
};

export const openTavernRoomSessionState = async (
  workspacePath: string,
  initialState: TavernRoomSessionState,
): Promise<TavernRoomSessionState> => (await loadTavernRoomSessionState(workspacePath)) ?? initialState;

export const saveTavernRoomSessionState = async (workspacePath: string, state: TavernRoomSessionState) => {
  if (!workspacePath.trim() || !isTauri()) {
    return;
  }

  const runtime = state.runtime;
  if (!runtime) {
    return;
  }

  await ensureTavernRoomSessionDirectory(workspacePath);
  await Promise.all([
    writeJsonWorkspaceFile(workspacePath, TAVERN_ROOM_FILE_NAME, runtime),
    writeJsonWorkspaceFile(workspacePath, TAVERN_MESSAGES_FILE_NAME, state.messages),
  ]);
};

export const deleteTavernRoomSessionState = async (workspacePath: string) => {
  if (!workspacePath.trim() || !isTauri()) {
    return;
  }

  await Promise.all([
    deleteWorkspaceFileIfExists(workspacePath, TAVERN_ROOM_FILE_NAME),
    deleteWorkspaceFileIfExists(workspacePath, TAVERN_MESSAGES_FILE_NAME),
  ]);
};
