import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernRuntimeScope } from "../storage";
import type { TavernRoomSessionState, TavernRuntimeRoom as TavernRoom } from "./model";
import type { TavernMessage } from "../tavern/types";

const TAVERN_SOURCE_DIR = "tavern";
const TAVERN_ROOM_FILE_NAME = "room.json";
const TAVERN_MESSAGES_FILE_NAME = "messages.json";
const TAVERN_CONVERSATION_FILE_NAME = "conversation.json";

const normalizeSlashes = (value: string) => value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");

const runtimePathToWorkspaceRelativePath = (workspacePath: string, runtimePath: string) => {
  const workspaceRoot = normalizeSlashes(workspacePath);
  const runtimeRoot = normalizeSlashes(runtimePath);
  if (!runtimeRoot) {
    return TAVERN_SOURCE_DIR;
  }

  if (runtimeRoot === workspaceRoot) {
    return TAVERN_SOURCE_DIR;
  }

  if (runtimeRoot.startsWith(`${workspaceRoot}/`)) {
    return runtimeRoot.slice(workspaceRoot.length + 1);
  }

  return runtimeRoot.replace(/^\/+/g, "");
};

const tavernBaseDir = (workspacePath: string, scope: TavernRuntimeScope = {}) =>
  scope.runtimePath?.trim() ? runtimePathToWorkspaceRelativePath(workspacePath, scope.runtimePath) : TAVERN_SOURCE_DIR;

const joinPath = (...parts: string[]) =>
  parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

const tavernMessagesPath = (baseDir: string) => joinPath(baseDir, TAVERN_MESSAGES_FILE_NAME);

const tavernConversationPath = (baseDir: string) => joinPath(baseDir, TAVERN_CONVERSATION_FILE_NAME);

const tavernRoomPath = (baseDir: string) => joinPath(baseDir, TAVERN_ROOM_FILE_NAME);

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

const writeJsonWorkspaceFile = async (workspacePath: string, relativePath: string, value: unknown) => {
  await invoke("write_workspace_file", {
    input: {
      workspacePath,
      relativePath,
      content: JSON.stringify(value, null, 2),
    },
  });
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

const normalizeTavernRuntimeRoom = (value: unknown): TavernRoom | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernRoom>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }

  return {
    ...candidate,
    id,
  } as TavernRoom;
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

const activeSceneInstanceIdFor = (room: TavernRoom) =>
  room.activeSceneInstanceId ?? room.sceneInstances?.[0]?.id ?? room.activeSceneId ?? room.id;

const materializeRuntimeMessagesForRoom = (room: TavernRoom, messages: TavernMessage[]) => {
  return messages.map((message) => ({
    ...message,
    roomId: message.roomId || room.id,
    status: message.status === "streaming" ? ("done" as const) : message.status,
  }));
};

const normalizeTavernRuntimeConversationMessages = (room: TavernRoom, value: unknown) => {
  const messages = normalizeTavernRuntimeMessages(value);
  if (messages) {
    return messages;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return normalizeTavernRuntimeMessages((value as Record<string, unknown>)[activeSceneInstanceIdFor(room)]);
};

export const loadTavernRoomSessionState = async (
  workspacePath: string,
  scope: TavernRuntimeScope = {},
  fallbackState?: TavernRoomSessionState,
): Promise<TavernRoomSessionState | null> => {
  if (!scope.runtimePath?.trim() || !isTauri()) {
    return null;
  }

  const baseDir = tavernBaseDir(workspacePath, scope);
  const room =
    normalizeTavernRuntimeRoom(await readJsonWorkspaceFile(workspacePath, tavernRoomPath(baseDir))) ??
    fallbackState?.room ??
    null;
  const messages =
    normalizeTavernRuntimeMessages(await readJsonWorkspaceFile(workspacePath, tavernMessagesPath(baseDir))) ??
    (room
      ? normalizeTavernRuntimeConversationMessages(
          room,
          await readJsonWorkspaceFile(workspacePath, tavernConversationPath(baseDir)),
        )
      : null);
  if (!room || !messages || messages.length === 0) {
    return null;
  }

  return {
    room,
    messages: materializeRuntimeMessagesForRoom(room, messages),
  };
};

export const saveTavernRoomSessionState = async (
  workspacePath: string,
  scope: TavernRuntimeScope = {},
  state: TavernRoomSessionState,
) => {
  if (!scope.runtimePath?.trim() || !isTauri()) {
    return;
  }

  const room = state.room;
  if (!room) {
    return;
  }

  const baseDir = tavernBaseDir(workspacePath, scope);
  await Promise.all([
    writeJsonWorkspaceFile(workspacePath, tavernRoomPath(baseDir), room),
    writeJsonWorkspaceFile(workspacePath, tavernMessagesPath(baseDir), state.messages),
    writeJsonWorkspaceFile(workspacePath, tavernConversationPath(baseDir), state.messages),
  ]);
};

export const deleteTavernRoomSessionState = async (workspacePath: string, scope: TavernRuntimeScope = {}) => {
  if (!scope.runtimePath?.trim() || !isTauri()) {
    return;
  }

  const baseDir = tavernBaseDir(workspacePath, scope);
  await Promise.all([
    deleteWorkspaceFileIfExists(workspacePath, tavernRoomPath(baseDir)),
    deleteWorkspaceFileIfExists(workspacePath, tavernMessagesPath(baseDir)),
    deleteWorkspaceFileIfExists(workspacePath, tavernConversationPath(baseDir)),
  ]);
};
