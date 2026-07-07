import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo } from "react";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
  useLlmSettingsStore,
} from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import { createTavernRoom } from "./tavern/factories/manual-factories";
import { createTavernRoomFromSystemPreset } from "./tavern/factories/system-preset-room";
import {
  runTavernTextFieldAgent,
  type TavernTextFieldAgentRequest,
} from "./tavern/runtime/assistants/field-polish-agent";
import { getTavernSystemPreset } from "./tavern/system-preset-registry";
import type { TavernState } from "./tavern/types";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 96) || "untitled";

export type TavernManagementValue = {
  rooms: TavernRoom[];
  createRoom: () => TavernRoom | void;
  patchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  copyRoom: (roomId: string) => boolean;
  restoreSystemPresetRoom: (roomId: string) => Promise<boolean>;
  deleteRoom: (roomId: string) => boolean;
  exportRoom: (roomId: string) => boolean;
  globalRuntimeModel: RuntimeModelOption | null;
  runTextFieldAgent: (request: TavernTextFieldAgentRequest) => Promise<string>;
};

type TavernManagementOptions = {
  workspace: Workspace;
  state: TavernState;
  setState: Dispatch<SetStateAction<TavernState>>;
  onError?: (message: string) => void;
};

export const useTavernManagement = ({ workspace, state, setState }: TavernManagementOptions) => {
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModel = runtimeModels[0] ?? null;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchRoom = useCallback(
    (roomId: string, patch: Partial<TavernRoom>) => {
      setState((current) => {
        let patchedRoom: TavernRoom | null = null;
        const nextRooms = current.rooms.map((room) => {
          if (room.id !== roomId) {
            return room;
          }

          patchedRoom = {
            ...room,
            ...patch,
            updatedAt: Date.now(),
          };
          return patchedRoom;
        });

        if (!patchedRoom) {
          return current;
        }

        return {
          ...current,
          rooms: nextRooms,
        };
      });
    },
    [setState],
  );
  const deleteRoom = useCallback(
    (roomId: string) => {
      const targetRoom = state.rooms.find((room) => room.id === roomId);
      if (!targetRoom) {
        return false;
      }

      setState((current) => {
        const currentTargetRoom = current.rooms.find((room) => room.id === roomId);
        if (!currentTargetRoom) {
          return current;
        }

        const nextRooms = current.rooms.filter((room) => room.id !== roomId);
        return {
          ...current,
          activeRoomId: current.activeRoomId === roomId ? (nextRooms[0]?.id ?? "") : current.activeRoomId,
          rooms: nextRooms,
        };
      });
      return true;
    },
    [setState, state.rooms],
  );

  const copyRoom = useCallback(
    (roomId: string) => {
      const sourceRoom = state.rooms.find((room) => room.id === roomId);
      if (!sourceRoom) {
        return false;
      }

      setState((current) => {
        const currentSourceRoom = current.rooms.find((room) => room.id === roomId);
        if (!currentSourceRoom) {
          return current;
        }

        const createdAt = Date.now();
        const copiedRoom: TavernRoom = {
          ...structuredClone(currentSourceRoom),
          id: createLocalId("room"),
          workspaceId: workspace.id,
          systemPresetId: undefined,
          systemPresetVersion: undefined,
          presentation: { ...sourceRoom.presentation },
          title: `${currentSourceRoom.title}（副本）`,
          createdAt,
          updatedAt: createdAt,
        };

        return {
          ...current,
          rooms: [...current.rooms, copiedRoom],
        };
      });
      return true;
    },
    [setState, state.rooms, workspace.id],
  );

  const restoreSystemPresetRoom = useCallback(
    async (roomId: string) => {
      const room = state.rooms.find((item) => item.id === roomId);
      const preset = getTavernSystemPreset(room?.systemPresetId);
      if (!room || !preset) {
        return false;
      }

      setState((current) => {
        const sourceRoom = current.rooms.find((item) => item.id === roomId);
        const sourcePreset = getTavernSystemPreset(sourceRoom?.systemPresetId);
        if (!sourceRoom || !sourcePreset) {
          return current;
        }

        const restored = createTavernRoomFromSystemPreset(workspace.id, sourcePreset.id, {
          roomId: sourceRoom.id,
          roomCreatedAt: sourceRoom.createdAt,
        });

        return {
          ...current,
          rooms: current.rooms.map((item) => (item.id === sourceRoom.id ? restored.room : item)),
        };
      });
      return true;
    },
    [setState, state.rooms, workspace.id],
  );

  const exportRoom = useCallback(
    (roomId: string) => {
      const targetRoom = state.rooms.find((room) => room.id === roomId);
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
    [state.rooms],
  );

  const createRoom = useCallback(() => {
    const nextRoom = {
      ...createTavernRoom(workspace.id, state.rooms.length + 1),
    };

    setState((current) => ({
      ...current,
      rooms: [...current.rooms, nextRoom],
    }));
    return nextRoom;
  }, [setState, state.rooms.length, workspace.id]);

  const runTextFieldAgent = useCallback(
    async (request: TavernTextFieldAgentRequest) => {
      if (!runtimeModel) {
        throw new Error(TAVERN_RUNTIME_MODEL_UNAVAILABLE);
      }

      return runTavernTextFieldAgent({
        ...request,
        workspacePath: workspace.path,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      });
    },
    [runtimeModel, workspace.path],
  );

  return useMemo<TavernManagementValue>(
    () => ({
      rooms: state.rooms,
      createRoom,
      patchRoom,
      copyRoom,
      restoreSystemPresetRoom,
      deleteRoom,
      exportRoom,
      globalRuntimeModel: runtimeModel,
      runTextFieldAgent,
    }),
    [
      copyRoom,
      createRoom,
      deleteRoom,
      exportRoom,
      patchRoom,
      restoreSystemPresetRoom,
      runTextFieldAgent,
      runtimeModel,
      state.rooms,
    ],
  );
};
