import { invoke, isTauri } from "@tauri-apps/api/core";
import { createDefaultTavernState, normalizeTavernState } from "./tavern/state/state-normalizer";
import type { TavernState } from "./tavern/types";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";

const TAVERN_SOURCE_DIR = "tavern";
const TAVERN_MANIFEST_FILE_NAME = "manifest.json";
const TAVERN_STATE_VERSION = 4;
const TAVERN_STORAGE_VERSION = 1;
const STORAGE_PREFIX = "novel-claw:tavern";

export type TavernRuntimeScope = {
  storyId?: string;
  storyNodeId?: string;
  tavernId?: string;
  runtimePath?: string;
};

type TavernManifestRoom = {
  id: string;
  title: string;
  roomPath: string;
  systemPresetId?: string;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
};

type TavernManifest = {
  version: 1;
  stateVersion: 4;
  activeRoomId: string;
  updatedAt: number;
  roomIds: string[];
  rooms: TavernManifestRoom[];
};

type SaveTavernRoomInput = {
  workspacePath: string;
  workspaceId: string;
  room: TavernRoom;
  scope?: TavernRuntimeScope;
  activate?: boolean;
};

const createEmptyTavernState = (): TavernState => ({
  version: TAVERN_STATE_VERSION,
  activeRoomId: "",
  rooms: [],
});

const toRoomConfigState = (state: TavernState): TavernState => ({
  version: TAVERN_STATE_VERSION,
  activeRoomId: state.activeRoomId,
  rooms: state.rooms,
});

const isStoryTavernScope = (scope: TavernRuntimeScope = {}) => Boolean(scope.storyId && scope.tavernId);

const createFallbackTavernState = (workspaceId: string, scope?: TavernRuntimeScope) =>
  toRoomConfigState(isStoryTavernScope(scope) ? createEmptyTavernState() : createDefaultTavernState(workspaceId));

const normalizeStateForScope = (workspaceId: string, value: unknown, scope?: TavernRuntimeScope) => {
  const normalized = normalizeTavernState(workspaceId, value, {
    includeDefaultRooms: !isStoryTavernScope(scope),
  });
  return normalized ? toRoomConfigState(normalized) : null;
};

const selectStateForScope = (state: TavernState, scope?: TavernRuntimeScope): TavernState => {
  const roomConfigState = toRoomConfigState(state);
  if (!isStoryTavernScope(scope)) {
    return roomConfigState;
  }

  const rooms = roomConfigState.rooms.filter((room) => room.id === scope?.tavernId);
  if (rooms.length === 0) {
    return roomConfigState;
  }

  return {
    ...roomConfigState,
    activeRoomId: rooms.some((room) => room.id === roomConfigState.activeRoomId)
      ? roomConfigState.activeRoomId
      : (rooms[0]?.id ?? ""),
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
    return createFallbackTavernState(workspaceId, scope);
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForWorkspace(workspaceId, scope));
    const parsed = raw ? JSON.parse(raw) : null;
    const normalizedState = normalizeStateForScope(workspaceId, parsed, scope);
    return normalizedState
      ? selectStateForScope(normalizedState, scope)
      : createFallbackTavernState(workspaceId, scope);
  } catch {
    return createFallbackTavernState(workspaceId, scope);
  }
};

const saveTavernStateToLocalStorage = (workspaceId: string, state: TavernState, scope?: TavernRuntimeScope) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedState = normalizeStateForScope(workspaceId, state, scope) ?? toRoomConfigState(state);
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

const normalizeTavernManifest = (value: unknown): TavernManifest | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernManifest>;
  if (
    candidate.version !== TAVERN_STORAGE_VERSION ||
    candidate.stateVersion !== TAVERN_STATE_VERSION ||
    !Array.isArray(candidate.roomIds)
  ) {
    return null;
  }

  const roomIds = candidate.roomIds
    .filter((roomId): roomId is string => typeof roomId === "string" && Boolean(roomId.trim()))
    .map((roomId) => roomId.trim());
  const rooms = Array.isArray(candidate.rooms)
    ? candidate.rooms.flatMap((room) => {
        if (!room || typeof room !== "object") {
          return [];
        }

        const source = room as Partial<TavernManifestRoom>;
        const id = typeof source.id === "string" ? source.id.trim() : "";
        if (!id) {
          return [];
        }

        return [
          {
            id,
            title: typeof source.title === "string" ? source.title : "未命名酒馆",
            roomPath: typeof source.roomPath === "string" ? source.roomPath : "",
            systemPresetId: typeof source.systemPresetId === "string" ? source.systemPresetId : undefined,
            locked: Boolean(source.locked),
            createdAt: typeof source.createdAt === "number" ? source.createdAt : Date.now(),
            updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : Date.now(),
          },
        ];
      })
    : [];

  return {
    version: TAVERN_STORAGE_VERSION,
    stateVersion: TAVERN_STATE_VERSION,
    activeRoomId: typeof candidate.activeRoomId === "string" ? candidate.activeRoomId : "",
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
    roomIds,
    rooms,
  };
};

const roomManifestById = (manifest: TavernManifest) => new Map(manifest.rooms.map((room) => [room.id, room] as const));

const createTavernManifestRoom = (baseDir: string, room: TavernRoom): TavernManifestRoom => ({
  id: room.id,
  title: room.title || "未命名酒馆",
  roomPath: tavernRoomPath(baseDir, room.id),
  systemPresetId: room.systemPresetId,
  locked: Boolean(room.locked),
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
});

const createTavernManifest = (baseDir: string, state: TavernState): TavernManifest => ({
  version: TAVERN_STORAGE_VERSION,
  stateVersion: TAVERN_STATE_VERSION,
  activeRoomId: state.activeRoomId,
  updatedAt: Date.now(),
  roomIds: state.rooms.map((room) => room.id),
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
  const manifest = normalizeTavernManifest(await readJsonWorkspaceFile(workspacePath, tavernManifestPath(baseDir)));
  if (!manifest) {
    return createFallbackTavernState(workspaceId, scope);
  }

  const roomManifest = roomManifestById(manifest);
  const rooms: unknown[] = [];

  for (const roomId of manifest.roomIds) {
    const manifestRoom = roomManifest.get(roomId);
    const room = await readJsonWorkspaceFile(workspacePath, manifestRoom?.roomPath || tavernRoomPath(baseDir, roomId));
    if (room && typeof room === "object") {
      rooms.push(room);
    }
  }

  const normalizedState = normalizeStateForScope(
    workspaceId,
    {
      version: TAVERN_STATE_VERSION,
      activeRoomId: manifest.activeRoomId,
      rooms,
    },
    scope,
  );
  return normalizedState ? selectStateForScope(normalizedState, scope) : createFallbackTavernState(workspaceId, scope);
};

export const saveTavernState = async (
  workspacePath: string,
  workspaceId: string,
  state: TavernState,
  scope: TavernRuntimeScope = {},
) => {
  const normalizedState = normalizeStateForScope(workspaceId, state, scope) ?? toRoomConfigState(state);
  const stateForStorage = selectStateForScope(normalizedState, scope);

  if (!isTauri()) {
    saveTavernStateToLocalStorage(workspaceId, stateForStorage, scope);
    return stateForStorage;
  }

  deleteTavernStateFromLocalStorage(workspaceId, scope);

  const baseDir = tavernBaseDir(workspacePath, scope);
  const previousManifest = normalizeTavernManifest(
    await readJsonWorkspaceFile(workspacePath, tavernManifestPath(baseDir)),
  );
  const nextRoomIds = new Set(stateForStorage.rooms.map((room) => room.id));
  const staleRoomIds = (previousManifest?.roomIds ?? []).filter((roomId) => !nextRoomIds.has(roomId));
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

export const clearTavernState = async (workspacePath: string, workspaceId: string, scope: TavernRuntimeScope = {}) => {
  if (!isTauri()) {
    deleteTavernStateFromLocalStorage(workspaceId, scope);
    return;
  }

  deleteTavernStateFromLocalStorage(workspaceId, scope);

  const baseDir = tavernBaseDir(workspacePath, scope);
  const manifest = normalizeTavernManifest(await readJsonWorkspaceFile(workspacePath, tavernManifestPath(baseDir)));
  const manifestRooms = manifest ? roomManifestById(manifest) : new Map<string, TavernManifestRoom>();
  const roomIds = manifest?.roomIds ?? [];

  await Promise.all(
    roomIds.map((roomId) => {
      const manifestRoom = manifestRooms.get(roomId);
      return deleteWorkspaceFileIfExists(workspacePath, manifestRoom?.roomPath || tavernRoomPath(baseDir, roomId));
    }),
  );
  await deleteWorkspaceFileIfExists(workspacePath, tavernManifestPath(baseDir));
};

export const listTavernRooms = async (workspacePath: string, workspaceId: string, scope: TavernRuntimeScope = {}) =>
  (await loadTavernState(workspacePath, workspaceId, scope)).rooms;

export const loadTavernRoom = async (
  workspacePath: string,
  workspaceId: string,
  roomId: string,
  scope: TavernRuntimeScope = {},
) => {
  const state = await loadTavernState(workspacePath, workspaceId, scope);
  return state.rooms.find((room) => room.id === roomId) ?? null;
};

export const saveTavernRoom = async ({
  workspacePath,
  workspaceId,
  room,
  scope = {},
  activate = true,
}: SaveTavernRoomInput) => {
  const current = await loadTavernState(workspacePath, workspaceId, scope);
  const nextRooms = current.rooms.some((item) => item.id === room.id)
    ? current.rooms.map((item) => (item.id === room.id ? room : item))
    : [...current.rooms, room];
  const nextState = await saveTavernState(
    workspacePath,
    workspaceId,
    {
      ...current,
      activeRoomId: activate ? room.id : current.activeRoomId || (nextRooms[0]?.id ?? ""),
      rooms: nextRooms,
    },
    scope,
  );

  return nextState.rooms.find((item) => item.id === room.id) ?? room;
};

export const deleteTavernRoom = async (
  workspacePath: string,
  workspaceId: string,
  roomId: string,
  scope: TavernRuntimeScope = {},
) => {
  const current = await loadTavernState(workspacePath, workspaceId, scope);
  if (!current.rooms.some((room) => room.id === roomId)) {
    return current;
  }

  const nextRooms = current.rooms.filter((room) => room.id !== roomId);
  return saveTavernState(
    workspacePath,
    workspaceId,
    {
      ...current,
      activeRoomId:
        current.activeRoomId === roomId
          ? (nextRooms.find((room) => room.id !== roomId)?.id ?? "")
          : current.activeRoomId,
      rooms: nextRooms,
    },
    scope,
  );
};
