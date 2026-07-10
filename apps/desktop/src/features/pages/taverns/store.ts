import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo } from "react";
import { cloneDeep } from "lodash-es";
import { type RuntimeModelOption, useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import { createEmptyManualTavernRoom, type TavernRoomConfig } from "@/features/pages/taverns/manage/model";

const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 96) || "untitled";

export type TavernManagementValue = {
  rooms: TavernRoomConfig[];
  createRoom: () => TavernRoomConfig | void;
  patchRoom: (roomId: string, patch: Partial<TavernRoomConfig>) => void;
  copyRoom: (roomId: string) => boolean;
  deleteRoom: (roomId: string) => boolean;
  exportRoom: (roomId: string) => boolean;
  globalRuntimeModel: RuntimeModelOption | null;
};

type TavernManagementOptions = {
  rooms: TavernRoomConfig[];
  setRooms: Dispatch<SetStateAction<TavernRoomConfig[]>>;
};

export const useTavernManagement = ({ rooms, setRooms }: TavernManagementOptions) => {
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModel = runtimeModels[0] ?? null;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchRoom = useCallback(
    (roomId: string, patch: Partial<TavernRoomConfig>) => {
      setRooms((currentRooms) => {
        let patchedRoom: TavernRoomConfig | null = null;
        const nextRooms = currentRooms.map((room) => {
          if (room.id !== roomId) {
            return room;
          }

          patchedRoom = {
            ...room,
            ...patch,
          };
          return patchedRoom;
        });

        if (!patchedRoom) {
          return currentRooms;
        }

        return nextRooms;
      });
    },
    [setRooms],
  );
  const deleteRoom = useCallback(
    (roomId: string) => {
      const targetRoom = rooms.find((room) => room.id === roomId);
      if (!targetRoom) {
        return false;
      }

      setRooms((currentRooms) => {
        const currentTargetRoom = currentRooms.find((room) => room.id === roomId);
        if (!currentTargetRoom) {
          return currentRooms;
        }

        return currentRooms.filter((room) => room.id !== roomId);
      });
      return true;
    },
    [rooms, setRooms],
  );

  const copyRoom = useCallback(
    (roomId: string) => {
      const sourceRoom = rooms.find((room) => room.id === roomId);
      if (!sourceRoom) {
        return false;
      }

      setRooms((currentRooms) => {
        const currentSourceRoom = currentRooms.find((room) => room.id === roomId);
        if (!currentSourceRoom) {
          return currentRooms;
        }

        const copiedRoom: TavernRoomConfig = {
          ...cloneDeep(currentSourceRoom),
          id: createLocalId("room"),
          presentation: { ...sourceRoom.presentation },
          title: `${currentSourceRoom.title}（副本）`,
        };

        return [...currentRooms, copiedRoom];
      });
      return true;
    },
    [rooms, setRooms],
  );

  const exportRoom = useCallback(
    (roomId: string) => {
      const targetRoom = rooms.find((room) => room.id === roomId);
      if (!targetRoom) {
        return false;
      }

      try {
        const blob = new Blob([JSON.stringify(targetRoom, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sanitizeFileName(targetRoom.title)}.tavern-room.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return true;
      } catch {
        return false;
      }
    },
    [rooms],
  );

  const createRoom = useCallback(() => {
    const nextRoom = {
      ...createEmptyManualTavernRoom(rooms.length + 1),
    };

    setRooms((currentRooms) => [...currentRooms, nextRoom]);
    return nextRoom;
  }, [rooms.length, setRooms]);

  return useMemo<TavernManagementValue>(
    () => ({
      rooms,
      createRoom,
      patchRoom,
      copyRoom,
      deleteRoom,
      exportRoom,
      globalRuntimeModel: runtimeModel,
    }),
    [copyRoom, createRoom, deleteRoom, exportRoom, patchRoom, rooms, runtimeModel],
  );
};
