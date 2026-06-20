import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type {
  RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import { getVisualPreset, type VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { Workspace } from "@/features/pages/workspace/types";
import {
  createDefaultTavernState,
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "../storage";
import { createTavernProgressCheckpoint } from "../core";
import type {
  TavernCharacter,
  TavernMessage,
  TavernProgressCheckpoint,
  TavernReplyOption,
  TavernRoom,
  TavernState,
} from "../types";
import type { ExecutionStep } from "./room/execution-trace";

export type TavernPageProps = {
  workspace: Workspace;
  files: WorkspaceFileEntry[];
  runtimeModel: RuntimeModelOption | null;
  runtimeAgentId: string;
  isHomeFullscreen?: boolean;
  onExitHomeFullscreen?: () => void;
};

type TavernPageProviderProps = Pick<
  TavernPageProps,
  "workspace" | "runtimeModel" | "runtimeAgentId"
>;

export type TavernPageContextValue = TavernPageProviderProps & {
  state: TavernState;
  setState: Dispatch<SetStateAction<TavernState>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  draftCursor: number;
  setDraftCursor: Dispatch<SetStateAction<number>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  isManagedModeEnabled: boolean;
  setIsManagedModeEnabled: Dispatch<SetStateAction<boolean>>;
  isManagedAutoRunStarted: boolean;
  setIsManagedAutoRunStarted: Dispatch<SetStateAction<boolean>>;
  isSending: boolean;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  isGeneratingReplySuggestions: boolean;
  setIsGeneratingReplySuggestions: Dispatch<SetStateAction<boolean>>;
  replySuggestions: TavernReplyOption[];
  setReplySuggestions: Dispatch<SetStateAction<TavernReplyOption[]>>;
  isQuickSummaryBusy: boolean;
  setIsQuickSummaryBusy: Dispatch<SetStateAction<boolean>>;
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
  appendProgressCheckpointToRoom: (
    room: TavernRoom,
    reason: TavernProgressCheckpoint["reason"],
    turnId?: string,
  ) => TavernRoom;
  patchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  appendMessagesToRoom: (roomId: string, messages: TavernMessage[]) => void;
  patchMessage: (messageId: string, patch: Partial<TavernMessage>) => void;
  removeMessage: (messageId: string) => void;
  reportError: (message: string) => void;
};

const getRoomActiveSceneId = (room: TavernRoom) =>
  room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

const getSceneMessages = (
  room: TavernRoom,
  state: Pick<TavernState, "messagesByScene">,
) => {
  const sceneId = getRoomActiveSceneId(room);
  return state.messagesByScene[sceneId] ?? [];
};

const TavernPageContext = createContext<TavernPageContextValue | null>(null);

export const TavernPageProvider = ({
  children,
  workspace,
  runtimeModel,
  runtimeAgentId,
}: TavernPageProviderProps & {
  children: ReactNode;
}) => {
  const [state, setState] = useState<TavernState>(() => createDefaultTavernState(workspace.id));
  const [draft, setDraft] = useState("");
  const [draftCursor, setDraftCursor] = useState(0);
  const [error, setError] = useState("");
  const [isManagedModeEnabled, setIsManagedModeEnabled] = useState(false);
  const [isManagedAutoRunStarted, setIsManagedAutoRunStarted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingReplySuggestions, setIsGeneratingReplySuggestions] = useState(false);
  const [replySuggestions, setReplySuggestions] = useState<TavernReplyOption[]>([]);
  const [isQuickSummaryBusy, setIsQuickSummaryBusy] = useState(false);
  const [turnStatus, setTurnStatus] = useState("");
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [executionTraceAnchorMessageId, setExecutionTraceAnchorMessageId] = useState("");

  const activeRoom = useMemo(
    () => {
      const room = state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null;
      return room ? projectTavernSceneOntoRoom(room) : null;
    },
    [state.activeRoomId, state.rooms],
  );
  const visualPreset = useMemo(
    () => getVisualPreset(activeRoom?.scenePresetId),
    [activeRoom?.scenePresetId],
  );
  const characterById = useMemo(
    () => new Map([
      ...state.rooms.flatMap((room) =>
        (room.localCharacters ?? []).map((character) => [character.id, character] as const)
      ),
    ]),
    [state.rooms],
  );
  const roomCharacters = useMemo(
    () => activeRoom
      ? activeRoom.characterIds
        .map((characterId) => characterById.get(characterId))
        .filter((character): character is TavernCharacter => Boolean(character))
      : [],
    [activeRoom, characterById],
  );
  const roomMessages = useMemo(
    () => activeRoom ? getSceneMessages(activeRoom, state) : [],
    [activeRoom, state],
  );
  const activeCharacter = useMemo(
    () => roomCharacters.find((character) => character.id === activeRoom?.activeCharacterId)
      ?? roomCharacters[0]
      ?? null,
    [activeRoom?.activeCharacterId, roomCharacters],
  );
  const resetExecutionTrace = useCallback((steps: ExecutionStep[]) => {
    setExecutionSteps(steps);
  }, []);
  const patchExecutionStep = useCallback((
    stepId: string,
    patch: Partial<Omit<ExecutionStep, "id">>,
  ) => {
    setExecutionSteps((current) => current.map((step) =>
      step.id === stepId ? { ...step, ...patch } : step
    ));
  }, []);
  const appendExecutionStep = useCallback((step: ExecutionStep) => {
    setExecutionSteps((current) => [...current, step]);
  }, []);
  const appendProgressCheckpointToRoom = useCallback((
    room: TavernRoom,
    reason: TavernProgressCheckpoint["reason"],
    turnId?: string,
  ): TavernRoom => {
    const checkpoint = createTavernProgressCheckpoint({
      room,
      turnId,
      reason,
      createdAt: Date.now(),
    });
    return syncTavernRoomActiveScene({
      ...room,
      statusCheckpoints: [...room.statusCheckpoints, checkpoint].slice(-20),
    });
  }, []);
  const patchRoom = useCallback((roomId: string, patch: Partial<TavernRoom>) => {
    setState((current) => {
      let patchedRoom: TavernRoom | null = null;
      const nextRooms = current.rooms.map((room) => {
        if (room.id !== roomId) {
          return room;
        }

        patchedRoom = syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(room),
          ...patch,
          updatedAt: Date.now(),
        });
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
  }, []);
  const appendMessagesToRoom = useCallback((roomId: string, messages: TavernMessage[]) => {
    setState((current) => {
      const room = current.rooms.find((item) => item.id === roomId);
      const sceneId = room ? getRoomActiveSceneId(room) : roomId;
      const nextSceneMessages = [
        ...(current.messagesByScene[sceneId] ?? []),
        ...messages,
      ];

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === roomId ? { ...room, updatedAt: Date.now() } : room,
        ),
        messagesByScene: {
          ...current.messagesByScene,
          [sceneId]: nextSceneMessages,
        },
      };
    });
  }, []);
  const patchMessage = useCallback((messageId: string, patch: Partial<TavernMessage>) => {
    setState((current) => {
      let patchedSceneId = "";
      const nextMessagesByScene = Object.fromEntries(
        Object.entries(current.messagesByScene).map(([sceneId, messages]) => {
          const nextMessages = messages.map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            patchedSceneId = sceneId;
            return {
              ...message,
              ...patch,
            };
          });
          return [sceneId, nextMessages];
        }),
      );

      if (!patchedSceneId) {
        return current;
      }

      return {
        ...current,
        messagesByScene: nextMessagesByScene,
      };
    });
  }, []);
  const removeMessage = useCallback((messageId: string) => {
    setState((current) => {
      let removedSceneId = "";
      const nextMessagesByScene = Object.fromEntries(
        Object.entries(current.messagesByScene).map(([sceneId, messages]) => {
          const nextMessages = messages.filter((message) => {
            const shouldKeep = message.id !== messageId;

            if (!shouldKeep) {
              removedSceneId = sceneId;
            }

            return shouldKeep;
          });
          return [sceneId, nextMessages];
        }),
      );

      if (!removedSceneId) {
        return current;
      }
      const removedRoom = current.rooms.find((room) => getRoomActiveSceneId(room) === removedSceneId);

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          removedRoom && room.id === removedRoom.id ? { ...room, updatedAt: Date.now() } : room
        ),
        messagesByScene: nextMessagesByScene,
      };
    });
  }, []);
  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const value = useMemo<TavernPageContextValue>(() => ({
    workspace,
    runtimeModel,
    runtimeAgentId,
    state,
    setState,
    draft,
    setDraft,
    draftCursor,
    setDraftCursor,
    error,
    setError,
    isManagedModeEnabled,
    setIsManagedModeEnabled,
    isManagedAutoRunStarted,
    setIsManagedAutoRunStarted,
    isSending,
    setIsSending,
    isGeneratingReplySuggestions,
    setIsGeneratingReplySuggestions,
    replySuggestions,
    setReplySuggestions,
    isQuickSummaryBusy,
    setIsQuickSummaryBusy,
    turnStatus,
    setTurnStatus,
    executionSteps,
    setExecutionSteps,
    executionTraceAnchorMessageId,
    setExecutionTraceAnchorMessageId,
    activeRoom,
    visualPreset,
    characterById,
    roomCharacters,
    roomMessages,
    activeCharacter,
    resetExecutionTrace,
    patchExecutionStep,
    appendExecutionStep,
    appendProgressCheckpointToRoom,
    patchRoom,
    appendMessagesToRoom,
    patchMessage,
    removeMessage,
    reportError,
  }), [
    activeCharacter,
    activeRoom,
    appendExecutionStep,
    appendMessagesToRoom,
    appendProgressCheckpointToRoom,
    characterById,
    draft,
    draftCursor,
    error,
    executionSteps,
    executionTraceAnchorMessageId,
    isGeneratingReplySuggestions,
    isManagedAutoRunStarted,
    isManagedModeEnabled,
    isQuickSummaryBusy,
    isSending,
    patchExecutionStep,
    patchMessage,
    patchRoom,
    replySuggestions,
    removeMessage,
    reportError,
    resetExecutionTrace,
    roomCharacters,
    roomMessages,
    runtimeAgentId,
    runtimeModel,
    state,
    turnStatus,
    visualPreset,
    workspace,
  ]);

  return (
    <TavernPageContext.Provider value={value}>
      {children}
    </TavernPageContext.Provider>
  );
};

export const useTavernPageContext = () => {
  const context = useContext(TavernPageContext);
  if (!context) {
    throw new Error("useTavernPageContext must be used within TavernPageProvider.");
  }
  return context;
};
