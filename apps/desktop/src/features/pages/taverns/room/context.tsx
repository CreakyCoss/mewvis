import type { TavernRoomSessionState, TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext } from "react";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter, TavernReplyOption } from "@/features/pages/taverns/manage/model";
import type { ExecutionStep } from "./execution-trace";

export type TavernRoomContextValue = {
  workspace: Workspace;
  runtimeModel: RuntimeModelOption | null;
  state: TavernRoomSessionState;
  setState: Dispatch<SetStateAction<TavernRoomSessionState>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  draftCursor: number;
  setDraftCursor: Dispatch<SetStateAction<number>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  isSending: boolean;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  isGeneratingReplySuggestions: boolean;
  setIsGeneratingReplySuggestions: Dispatch<SetStateAction<boolean>>;
  replySuggestions: TavernReplyOption[];
  setReplySuggestions: Dispatch<SetStateAction<TavernReplyOption[]>>;
  turnStatus: string;
  setTurnStatus: Dispatch<SetStateAction<string>>;
  executionSteps: ExecutionStep[];
  setExecutionSteps: Dispatch<SetStateAction<ExecutionStep[]>>;
  executionTraceAnchorMessageId: string;
  setExecutionTraceAnchorMessageId: Dispatch<SetStateAction<string>>;
  activeRoom: TavernRoom | null;
  visualPreset: VisualPresetDefinition;
  characterById: Map<string, TavernCharacter>;
  roomCharacters: TavernCharacter[];
  roomMessages: TavernMessage[];
  activeCharacter: TavernCharacter | null;
  resetExecutionTrace: (steps: ExecutionStep[]) => void;
  patchExecutionStep: (stepId: string, patch: Partial<Omit<ExecutionStep, "id">>) => void;
  appendExecutionStep: (step: ExecutionStep) => void;
  upsertExecutionStep: (step: ExecutionStep) => void;
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
