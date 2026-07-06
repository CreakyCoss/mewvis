import { create } from "zustand";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernTextFieldAgentRequest } from "../tavern/runtime/assistants";
import type { TavernCharacter, TavernMessage, TavernRoom, TavernRoomSettings } from "../tavern/types";

export type ManagementStoreValue = {
  rooms: TavernRoom[];
  activeRoomId: string;
  characterById: Map<string, TavernCharacter>;
  messagesByRoomId: Record<string, TavernMessage[]>;
  createRoom: () => TavernRoom | void;
  selectRoom: (roomId: string) => void;
  patchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  copyRoom: (roomId: string) => boolean;
  restoreSystemPresetRoom: (roomId: string) => Promise<boolean>;
  setRoomLocked: (roomId: string, locked: boolean) => boolean;
  deleteRoom: (roomId: string) => boolean;
  exportRoom: (roomId: string) => boolean;
  globalRuntimeModel: RuntimeModelOption | null;
  runTextFieldAgent: (request: TavernTextFieldAgentRequest) => Promise<string>;
  regenerateDirectorProfile: (
    room: TavernRoom,
  ) => Promise<NonNullable<TavernRoomSettings["directorScheduling"]["profile"]>>;
};

const createInitialManagementStoreValue = (): ManagementStoreValue => ({
  rooms: [],
  activeRoomId: "",
  characterById: new Map(),
  messagesByRoomId: {},
  createRoom: () => undefined,
  selectRoom: () => undefined,
  patchRoom: () => undefined,
  copyRoom: () => false,
  restoreSystemPresetRoom: async () => false,
  setRoomLocked: () => false,
  deleteRoom: () => false,
  exportRoom: () => false,
  globalRuntimeModel: null,
  runTextFieldAgent: async () => "",
  regenerateDirectorProfile: async () => {
    throw new Error("Management store is not initialized.");
  },
});

export const useManagementStore = create<ManagementStoreValue>(() => createInitialManagementStoreValue());

export const syncManagementStore = (value: ManagementStoreValue) => {
  useManagementStore.setState(value);
};
