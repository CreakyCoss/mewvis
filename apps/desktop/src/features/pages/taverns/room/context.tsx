import type { TavernRoomSessionState, TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext } from "react";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

export type TavernRoomBusyKind = "idle" | "sending" | "reply_suggestions";

export type TavernRoomBusyState = {
  kind: TavernRoomBusyKind;
  status: string;
};

export const createIdleTavernRoomBusyState = (): TavernRoomBusyState => ({
  kind: "idle",
  status: "",
});

export const isTavernRoomBusy = (busy: TavernRoomBusyState) => busy.kind !== "idle";

export const isTavernRoomSending = (busy: TavernRoomBusyState) => busy.kind === "sending";

export const isTavernRoomGeneratingReplySuggestions = (busy: TavernRoomBusyState) => busy.kind === "reply_suggestions";

export type TavernRoomContextValue = {
  workspace: Workspace;
  runtimeModel: RuntimeModelOption | null;
  state: TavernRoomSessionState;
  setState: Dispatch<SetStateAction<TavernRoomSessionState>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  busy: TavernRoomBusyState;
  setBusy: Dispatch<SetStateAction<TavernRoomBusyState>>;
  setBusyStatus: (status: string) => void;
  activeRoom: TavernRoom | null;
  visualPreset: VisualPresetDefinition;
  characterById: Map<string, TavernCharacter>;
  roomCharacters: TavernCharacter[];
  roomMessages: TavernMessage[];
  activeCharacter: TavernCharacter | null;
  patchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  appendMessagesToRoom: (roomId: string, messages: TavernMessage[]) => void;
  patchMessage: (messageId: string, patch: Partial<TavernMessage>) => void;
  removeMessage: (messageId: string) => void;
  reportError: (message: string) => void;
};

const TavernRoomContext = createContext<TavernRoomContextValue | null>(null);

export const TavernRoomProvider = ({ children, value }: { children: ReactNode; value: TavernRoomContextValue }) => (
  <TavernRoomContext.Provider value={value}>{children}</TavernRoomContext.Provider>
);

export const useTavernRoomContext = () => {
  const context = useContext(TavernRoomContext);
  if (!context) {
    throw new Error("useTavernRoomContext must be used within TavernRoomProvider");
  }
  return context;
};
