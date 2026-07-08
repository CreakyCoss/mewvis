import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernMessage } from "../tavern/types";
import {
  isTavernRoomRuntime,
  materializeTavernRoomMessages,
  type TavernRoomRuntime,
  type TavernRoomSessionState,
} from "./model";

const TAVERN_ROOM_FILE_NAME = "room.json";
const TAVERN_MESSAGES_FILE_NAME = "messages.json";
const TAVERN_CONVERSATION_FILE_NAME = "conversation.json";
const TAVERN_WORKSPACE_PATH_MARKER = "/.tavern/";
const TAVERN_WORKSPACE_INIT_FILE_PREFIX = ".__tavern_workspace_init";
const ensuredTavernWorkspacePaths = new Set<string>();

const normalizePathSeparators = (value: string) => value.trim().replace(/\\/g, "/").replace(/\/+$/, "");

const resolveTavernWorkspaceBackingPath = (tavernWorkspacePath: string) => {
  const normalizedPath = normalizePathSeparators(tavernWorkspacePath);
  const markerIndex = normalizedPath.lastIndexOf(TAVERN_WORKSPACE_PATH_MARKER);
  if (markerIndex <= 0) {
    return null;
  }

  return {
    workspacePath: normalizedPath.slice(0, markerIndex),
    relativePath: normalizedPath.slice(markerIndex + 1),
  };
};

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

export const ensureTavernWorkspaceDirectory = async (tavernWorkspacePath: string) => {
  if (!tavernWorkspacePath.trim() || !isTauri()) {
    return;
  }

  const normalizedPath = normalizePathSeparators(tavernWorkspacePath);
  if (ensuredTavernWorkspacePaths.has(normalizedPath)) {
    return;
  }

  const backingPath = resolveTavernWorkspaceBackingPath(tavernWorkspacePath);
  if (!backingPath) {
    ensuredTavernWorkspacePaths.add(normalizedPath);
    return;
  }

  const initFileName = `${TAVERN_WORKSPACE_INIT_FILE_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  const initFilePath = `${backingPath.relativePath}/${initFileName}`;
  await writeTextWorkspaceFile(backingPath.workspacePath, initFilePath, "");
  await deleteWorkspaceFileIfExists(backingPath.workspacePath, initFilePath);
  ensuredTavernWorkspacePaths.add(normalizedPath);
};

const normalizeTavernRuntimeMessages = (value: unknown): TavernMessage[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((message) => {
    if (!message || typeof message !== "object") {
      return [];
    }

    const candidate = message as Partial<TavernMessage>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.roomId !== "string" ||
      typeof candidate.content !== "string" ||
      typeof candidate.createdAt !== "number" ||
      (candidate.role !== "user" && candidate.role !== "character" && candidate.role !== "narrator")
    ) {
      return [];
    }

    return [candidate as TavernMessage];
  });
};

const normalizeTavernRoomRuntime = (value: unknown): TavernRoomRuntime | null => {
  return isTavernRoomRuntime(value) ? value : null;
};

export const loadTavernRoomSessionState = async (
  tavernWorkspacePath: string,
  fallbackState?: TavernRoomSessionState,
): Promise<TavernRoomSessionState | null> => {
  if (!tavernWorkspacePath.trim() || !isTauri()) {
    return null;
  }

  const runtime =
    normalizeTavernRoomRuntime(await readJsonWorkspaceFile(tavernWorkspacePath, TAVERN_ROOM_FILE_NAME)) ??
    fallbackState?.runtime ??
    null;
  const messages =
    normalizeTavernRuntimeMessages(await readJsonWorkspaceFile(tavernWorkspacePath, TAVERN_MESSAGES_FILE_NAME)) ??
    normalizeTavernRuntimeMessages(await readJsonWorkspaceFile(tavernWorkspacePath, TAVERN_CONVERSATION_FILE_NAME)) ??
    null;
  if (!runtime || !messages || messages.length === 0) {
    return null;
  }

  return {
    runtime,
    messages: materializeTavernRoomMessages(runtime, messages),
  };
};

export const saveTavernRoomSessionState = async (tavernWorkspacePath: string, state: TavernRoomSessionState) => {
  if (!tavernWorkspacePath.trim() || !isTauri()) {
    return;
  }

  const runtime = state.runtime;
  if (!runtime) {
    return;
  }

  await ensureTavernWorkspaceDirectory(tavernWorkspacePath);
  await Promise.all([
    writeJsonWorkspaceFile(tavernWorkspacePath, TAVERN_ROOM_FILE_NAME, runtime),
    writeJsonWorkspaceFile(tavernWorkspacePath, TAVERN_MESSAGES_FILE_NAME, state.messages),
  ]);
};

export const deleteTavernRoomSessionState = async (tavernWorkspacePath: string) => {
  if (!tavernWorkspacePath.trim() || !isTauri()) {
    return;
  }

  await Promise.all([
    deleteWorkspaceFileIfExists(tavernWorkspacePath, TAVERN_ROOM_FILE_NAME),
    deleteWorkspaceFileIfExists(tavernWorkspacePath, TAVERN_MESSAGES_FILE_NAME),
    deleteWorkspaceFileIfExists(tavernWorkspacePath, TAVERN_CONVERSATION_FILE_NAME),
  ]);
};
