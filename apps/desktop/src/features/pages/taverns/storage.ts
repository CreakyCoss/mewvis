import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernState } from "./tavern/types";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";

const TAVERN_SOURCE_DIR = "tavern";
const TAVERN_MANIFEST_FILE_NAME = "manifest.json";
const STORAGE_PREFIX = "novel-claw:tavern";

type TavernRuntimeScope = {
  storyId?: string;
  storyNodeId?: string;
  tavernId?: string;
  runtimePath?: string;
};

type TavernManifestRoom = {
  id: string;
  title: string;
  roomPath: string;
  createdAt: number;
  updatedAt: number;
};

type TavernManifest = {
  rooms: TavernManifestRoom[];
};

const createEmptyTavernState = (): TavernState => ({
  rooms: [],
});

const isStoryTavernScope = (scope: TavernRuntimeScope = {}) => Boolean(scope.storyId && scope.tavernId);

const createFallbackTavernState = () => createEmptyTavernState();

const normalizeTavernState = (workspaceId: string, value: unknown): TavernState | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernState>;
  if (!Array.isArray(candidate.rooms)) {
    return null;
  }

  const rooms = candidate.rooms
    .map((room) => {
      const source = room as TavernRoom;
      return source.id && source.workspaceId === workspaceId && source.title ? source : null;
    })
    .filter((room): room is TavernRoom => Boolean(room));

  return rooms.length > 0 ? { rooms } : null;
};

const selectStateForScope = (state: TavernState, scope?: TavernRuntimeScope): TavernState => {
  if (!isStoryTavernScope(scope)) {
    return state;
  }

  const rooms = state.rooms.filter((room) => room.id === scope?.tavernId);
  if (rooms.length === 0) {
    return state;
  }

  return {
    rooms,
  };
};

const storageKeyForWorkspace = (workspaceId: string, scope: TavernRuntimeScope = {}) =>
  [STORAGE_PREFIX, workspaceId, scope.storyId, scope.tavernId, scope.runtimePath].filter(Boolean).join(":");

const loadTavernStateFromLocalStorage = async (
  workspaceId: string,
  scope?: TavernRuntimeScope,
): Promise<TavernState> => {
  if (typeof window === "undefined") {
    return createFallbackTavernState();
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForWorkspace(workspaceId, scope));
    const parsed = raw ? JSON.parse(raw) : null;
    const normalizedState = normalizeTavernState(workspaceId, parsed);
    return normalizedState ? selectStateForScope(normalizedState, scope) : createFallbackTavernState();
  } catch {
    return createFallbackTavernState();
  }
};

const saveTavernStateToLocalStorage = (workspaceId: string, state: TavernState, scope?: TavernRuntimeScope) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;
  window.localStorage.setItem(
    storageKeyForWorkspace(workspaceId, scope),
    JSON.stringify(selectStateForScope(normalizedState, scope)),
  );
};

const deleteTavernStateFromLocalStorage = (workspaceId: string, scope?: TavernRuntimeScope) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKeyForWorkspace(workspaceId, scope));
};

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

const roomFileToken = (roomId: string) => encodeURIComponent(roomId.trim() || "room");

const tavernManifestPath = (baseDir: string) => joinPath(baseDir, TAVERN_MANIFEST_FILE_NAME);

const tavernRoomPath = (baseDir: string, roomId: string) => joinPath(baseDir, "rooms", `${roomFileToken(roomId)}.json`);

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
    // Missing files are fine: the manifest is the source of truth.
  }
};

const readTavernManifest = (value: unknown): TavernManifest | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernManifest>;
  if (!Array.isArray(candidate.rooms)) {
    return null;
  }

  return { rooms: candidate.rooms as TavernManifestRoom[] };
};

const roomManifestById = (manifest: TavernManifest) => new Map(manifest.rooms.map((room) => [room.id, room] as const));

const createTavernManifestRoom = (baseDir: string, room: TavernRoom): TavernManifestRoom => ({
  id: room.id,
  title: room.title || "未命名酒馆",
  roomPath: tavernRoomPath(baseDir, room.id),
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
});

const createTavernManifest = (baseDir: string, state: TavernState): TavernManifest => ({
  rooms: state.rooms.map((room) => createTavernManifestRoom(baseDir, room)),
});

export const loadTavernState = async (
  workspacePath: string,
  workspaceId: string,
  scope: TavernRuntimeScope = {},
): Promise<TavernState> => {
  if (!isTauri()) {
    return loadTavernStateFromLocalStorage(workspaceId, scope);
  }

  deleteTavernStateFromLocalStorage(workspaceId, scope);

  const baseDir = tavernBaseDir(workspacePath, scope);
  const manifest = readTavernManifest(await readJsonWorkspaceFile(workspacePath, tavernManifestPath(baseDir)));
  if (!manifest) {
    return createFallbackTavernState();
  }

  const rooms: unknown[] = [];

  for (const manifestRoom of manifest.rooms) {
    const room = await readJsonWorkspaceFile(
      workspacePath,
      manifestRoom.roomPath || tavernRoomPath(baseDir, manifestRoom.id),
    );
    if (room && typeof room === "object") {
      rooms.push(room);
    }
  }

  const normalizedState = normalizeTavernState(workspaceId, { rooms });
  return normalizedState ? selectStateForScope(normalizedState, scope) : createFallbackTavernState();
};

export const saveTavernState = async (
  workspacePath: string,
  workspaceId: string,
  state: TavernState,
  scope: TavernRuntimeScope = {},
) => {
  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;
  const stateForStorage = selectStateForScope(normalizedState, scope);

  if (!isTauri()) {
    saveTavernStateToLocalStorage(workspaceId, stateForStorage, scope);
    return stateForStorage;
  }

  deleteTavernStateFromLocalStorage(workspaceId, scope);

  const baseDir = tavernBaseDir(workspacePath, scope);
  const previousManifest = readTavernManifest(await readJsonWorkspaceFile(workspacePath, tavernManifestPath(baseDir)));
  const nextRoomIds = new Set(stateForStorage.rooms.map((room) => room.id));
  const staleRoomIds = (previousManifest?.rooms.map((room) => room.id) ?? []).filter(
    (roomId) => !nextRoomIds.has(roomId),
  );
  const previousRooms = previousManifest ? roomManifestById(previousManifest) : new Map<string, TavernManifestRoom>();

  await Promise.all(
    staleRoomIds.map((roomId) => {
      const manifestRoom = previousRooms.get(roomId);
      return deleteWorkspaceFileIfExists(workspacePath, manifestRoom?.roomPath || tavernRoomPath(baseDir, roomId));
    }),
  );

  await Promise.all(
    stateForStorage.rooms.map((room) => writeJsonWorkspaceFile(workspacePath, tavernRoomPath(baseDir, room.id), room)),
  );

  await writeJsonWorkspaceFile(
    workspacePath,
    tavernManifestPath(baseDir),
    createTavernManifest(baseDir, stateForStorage),
  );
  return stateForStorage;
};
