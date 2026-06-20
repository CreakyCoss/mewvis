import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernTextFieldAgentRequest } from "../../runtime/field-polish-agent";
import type { TavernGeneratedPresetAgentDraft } from "../../runtime/generated-preset-agent";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
  TavernRoomSettings,
} from "../../types";

export type PageNavigationHandle = {
  open: (room: TavernRoom) => void;
};

export type ManagementContextValue = {
  rooms: TavernRoom[];
  activeRoom: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  messagesByRoomId: Record<string, TavernMessage[]>;
  createRoom: () => string | void;
  quickCreateRoom: (draft: TavernGeneratedPresetAgentDraft) => Promise<string | null>;
  selectRoom: (roomId: string) => void;
  patchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  copyRoom: (roomId: string) => boolean;
  restoreSystemPresetRoom: (roomId: string) => Promise<boolean>;
  setRoomLocked: (roomId: string, locked: boolean) => boolean;
  deleteRoom: (roomId: string) => boolean;
  clearRoomMessages: (roomId: string) => Promise<boolean>;
  exportRoom: (roomId: string) => boolean;
  importRoom: (raw: string) => string | null;
  globalRuntimeModel: RuntimeModelOption | null;
  runTextFieldAgent: (request: TavernTextFieldAgentRequest) => Promise<string>;
  regenerateDirectorProfile: (
    room: TavernRoom,
  ) => Promise<NonNullable<TavernRoomSettings["directorScheduling"]["profile"]>>;
};

const ManagementContext = createContext<ManagementContextValue | null>(null);

export const ManagementContextProvider = ({
  value,
  children,
}: {
  value: ManagementContextValue;
  children: ReactNode;
}) => (
  <ManagementContext.Provider value={value}>
    {children}
  </ManagementContext.Provider>
);

export const useManagementContext = () => {
  const value = useContext(ManagementContext);
  if (!value) {
    throw new Error("ManagementContext is missing.");
  }

  return value;
};
