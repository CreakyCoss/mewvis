import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { readJsonWorkspaceFile, writeJsonWorkspaceFile } from "@/utils/files";

const TAVERN_SOURCE_DIR = "tavern";
const TAVERN_MANIFEST_FILE_NAME = "manifest.json";
const STORAGE_PREFIX = "novel-claw:tavern";

type TavernManifestRoom = {
  id: string;
  title: string;
  roomPath: string;
};

type TavernManifest = {
  rooms: TavernManifestRoom[];
};

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const loadTavernRoomsFromLocalStorage = (workspaceId: string): TavernRoomConfig[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForWorkspace(workspaceId));
    const rooms = raw ? JSON.parse(raw) : [];
    return Array.isArray(rooms) ? rooms : [];
  } catch {
    return [];
  }
};

const saveTavernRoomsToLocalStorage = (workspaceId: string, rooms: TavernRoomConfig[]) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKeyForWorkspace(workspaceId), JSON.stringify(rooms));
  }
};

const deleteTavernRoomsFromLocalStorage = (workspaceId: string) => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKeyForWorkspace(workspaceId));
  }
};

const joinPath = (...parts: string[]) =>
  parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

const roomFileToken = (roomId: string) => encodeURIComponent(roomId.trim() || "room");

const tavernManifestPath = () => joinPath(TAVERN_SOURCE_DIR, TAVERN_MANIFEST_FILE_NAME);

const tavernRoomPath = (roomId: string) => joinPath(TAVERN_SOURCE_DIR, "rooms", `${roomFileToken(roomId)}.json`);

const deleteWorkspaceFileIfExists = async (workspacePath: string, relativePath: string) => {
  try {
    await invoke("delete_workspace_file", {
      input: { workspacePath, relativePath },
    });
  } catch {
    // Missing files are fine: the manifest is the source of truth.
  }
};

const createTavernManifestRoom = (room: TavernRoomConfig): TavernManifestRoom => ({
  id: room.id,
  title: room.title || "未命名酒馆",
  roomPath: tavernRoomPath(room.id),
});

const createTavernManifest = (rooms: TavernRoomConfig[]): TavernManifest => ({
  rooms: rooms.map(createTavernManifestRoom),
});

export const loadTavernRooms = async (workspacePath: string, workspaceId: string): Promise<TavernRoomConfig[]> => {
  if (!isTauri()) {
    return loadTavernRoomsFromLocalStorage(workspaceId);
  }

  deleteTavernRoomsFromLocalStorage(workspaceId);

  const manifest = await readJsonWorkspaceFile<TavernManifest>(workspacePath, tavernManifestPath());
  if (!manifest) {
    return [];
  }

  const rooms = await Promise.all(
    manifest.rooms.map((manifestRoom) => readJsonWorkspaceFile<TavernRoomConfig>(workspacePath, manifestRoom.roomPath)),
  );
  return rooms.filter((room): room is TavernRoomConfig => room !== null);
};

export const saveTavernRooms = async (workspacePath: string, workspaceId: string, rooms: TavernRoomConfig[]) => {
  if (!isTauri()) {
    saveTavernRoomsToLocalStorage(workspaceId, rooms);
    return rooms;
  }

  deleteTavernRoomsFromLocalStorage(workspaceId);

  const previousManifest = await readJsonWorkspaceFile<TavernManifest>(workspacePath, tavernManifestPath());
  const nextRoomIds = new Set(rooms.map((room) => room.id));
  const staleRooms = previousManifest?.rooms.filter((room) => !nextRoomIds.has(room.id)) ?? [];

  await Promise.all(staleRooms.map((room) => deleteWorkspaceFileIfExists(workspacePath, room.roomPath)));
  await Promise.all(rooms.map((room) => writeJsonWorkspaceFile(workspacePath, tavernRoomPath(room.id), room)));
  await writeJsonWorkspaceFile(workspacePath, tavernManifestPath(), createTavernManifest(rooms));

  return rooms;
};
