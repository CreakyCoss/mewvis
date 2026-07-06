import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import { getVisualPreset, type VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { Workspace } from "@/features/pages/workspace/types";
import type { TavernRuntimeScope } from "../tavern/state/storage";
import { projectTavernSceneOntoRoom, syncTavernRoomActiveScene } from "../tavern/runtime/active-scene-runtime";
import { createDefaultTavernState } from "../tavern/state/state-normalizer";
import { hasTavernPresentationStarted, normalizeTavernPresentation } from "../tavern/prompt-registry/presentation-rules";
import { createTavernProgressCheckpoint } from "../tavern/core";
import { buildTavernMessageSegments, inferTavernMessageKind } from "../tavern/message";
import type {
  TavernCharacter,
  TavernMessage,
  TavernProgressCheckpoint,
  TavernReplyOption,
  TavernRoom,
  TavernState,
} from "../tavern/types";
import type { ExecutionStep } from "../room/execution-trace";

export type TavernPageProps = {
  workspace: Workspace;
  runtimeScope?: TavernRuntimeScope;
  files: WorkspaceFileEntry[];
  runtimeModel: RuntimeModelOption | null;
  initialRoomId?: string;
  initialSceneInstanceId?: string;
  onExitStoryRuntime?: () => void;
};

type TavernPageProviderProps = Pick<TavernPageProps, "workspace" | "runtimeModel">;

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
  upsertExecutionStep: (step: ExecutionStep) => void;
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

const getRoomActiveSceneInstanceId = (room: TavernRoom) =>
  room.activeSceneInstanceId ?? room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

const getSceneMessages = (room: TavernRoom, state: Pick<TavernState, "messagesByInstance">) => {
  const sceneInstanceId = getRoomActiveSceneInstanceId(room);
  return state.messagesByInstance[sceneInstanceId] ?? [];
};

const EMPTY_WORKSPACE: Workspace = {
  id: "",
  name: "",
  description: null,
  path: "",
  isDefault: false,
  isPinned: false,
  order: 0,
  groupId: null,
  createdAt: 0,
  updatedAt: 0,
};

type TavernPageDerivedState = Pick<
  TavernPageContextValue,
  "activeRoom" | "visualPreset" | "characterById" | "roomCharacters" | "roomMessages" | "activeCharacter"
>;

type TavernPageStore = TavernPageContextValue & {
  configure: (props: TavernPageProviderProps) => void;
  resetForWorkspace: (workspace: Workspace, runtimeModel: RuntimeModelOption | null) => void;
};

const resolveSetStateAction = <T,>(action: SetStateAction<T>, current: T) =>
  typeof action === "function" ? (action as (previous: T) => T)(current) : action;

const deriveTavernPageState = (state: TavernState): TavernPageDerivedState => {
  const room = state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null;
  const activeRoom = room ? projectTavernSceneOntoRoom(room) : null;
  const visualPreset = getVisualPreset(activeRoom?.scenePresetId);
  const characterById = new Map([
    ...state.rooms.flatMap((room) =>
      (room.localCharacters ?? []).map((character) => [character.id, character] as const),
    ),
  ]);
  const roomCharacters = activeRoom
    ? activeRoom.characterIds
        .map((characterId) => characterById.get(characterId))
        .filter((character): character is TavernCharacter => Boolean(character))
    : [];
  const roomMessages = activeRoom ? getSceneMessages(activeRoom, state) : [];
  const activeCharacter =
    roomCharacters.find((character) => character.id === activeRoom?.activeCharacterId) ?? roomCharacters[0] ?? null;

  return {
    activeRoom,
    visualPreset,
    characterById,
    roomCharacters,
    roomMessages,
    activeCharacter,
  };
};

const initialTavernState = createDefaultTavernState(EMPTY_WORKSPACE.id);

export const useTavernPageStore = create<TavernPageStore>((set, get) => ({
  workspace: EMPTY_WORKSPACE,
  runtimeModel: null,
  state: initialTavernState,
  ...deriveTavernPageState(initialTavernState),
  draft: "",
  draftCursor: 0,
  error: "",
  isManagedModeEnabled: false,
  isManagedAutoRunStarted: false,
  isSending: false,
  isGeneratingReplySuggestions: false,
  replySuggestions: [],
  isQuickSummaryBusy: false,
  turnStatus: "",
  executionSteps: [],
  executionTraceAnchorMessageId: "",
  configure: ({ workspace, runtimeModel }) => set({ workspace, runtimeModel }),
  resetForWorkspace: (workspace, runtimeModel) => {
    const state = createDefaultTavernState(workspace.id);
    set({
      workspace,
      runtimeModel,
      state,
      ...deriveTavernPageState(state),
      draft: "",
      draftCursor: 0,
      error: "",
      isManagedModeEnabled: false,
      isManagedAutoRunStarted: false,
      isSending: false,
      isGeneratingReplySuggestions: false,
      replySuggestions: [],
      isQuickSummaryBusy: false,
      turnStatus: "",
      executionSteps: [],
      executionTraceAnchorMessageId: "",
    });
  },
  setState: (action) =>
    set((current) => {
      const state = resolveSetStateAction(action, current.state);
      return {
        state,
        ...deriveTavernPageState(state),
      };
    }),
  setDraft: (action) =>
    set((current) => ({
      draft: resolveSetStateAction(action, current.draft),
    })),
  setDraftCursor: (action) =>
    set((current) => ({
      draftCursor: resolveSetStateAction(action, current.draftCursor),
    })),
  setError: (action) =>
    set((current) => ({
      error: resolveSetStateAction(action, current.error),
    })),
  setIsManagedModeEnabled: (action) =>
    set((current) => ({
      isManagedModeEnabled: resolveSetStateAction(action, current.isManagedModeEnabled),
    })),
  setIsManagedAutoRunStarted: (action) =>
    set((current) => ({
      isManagedAutoRunStarted: resolveSetStateAction(action, current.isManagedAutoRunStarted),
    })),
  setIsSending: (action) =>
    set((current) => ({
      isSending: resolveSetStateAction(action, current.isSending),
    })),
  setIsGeneratingReplySuggestions: (action) =>
    set((current) => ({
      isGeneratingReplySuggestions: resolveSetStateAction(action, current.isGeneratingReplySuggestions),
    })),
  setReplySuggestions: (action) =>
    set((current) => ({
      replySuggestions: resolveSetStateAction(action, current.replySuggestions),
    })),
  setIsQuickSummaryBusy: (action) =>
    set((current) => ({
      isQuickSummaryBusy: resolveSetStateAction(action, current.isQuickSummaryBusy),
    })),
  setTurnStatus: (action) =>
    set((current) => ({
      turnStatus: resolveSetStateAction(action, current.turnStatus),
    })),
  setExecutionSteps: (action) =>
    set((current) => ({
      executionSteps: resolveSetStateAction(action, current.executionSteps),
    })),
  setExecutionTraceAnchorMessageId: (action) =>
    set((current) => ({
      executionTraceAnchorMessageId: resolveSetStateAction(action, current.executionTraceAnchorMessageId),
    })),
  resetExecutionTrace: (steps) => {
    set({ executionSteps: steps });
  },
  patchExecutionStep: (stepId, patch) => {
    set((current) => ({
      executionSteps: current.executionSteps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }));
  },
  appendExecutionStep: (step) => {
    set((current) => ({
      executionSteps: [...current.executionSteps, step],
    }));
  },
  upsertExecutionStep: (step) => {
    set((current) => ({
      executionSteps: current.executionSteps.some((item) => item.id === step.id)
        ? current.executionSteps.map((item) => (item.id === step.id ? { ...item, ...step } : item))
        : [...current.executionSteps, step],
    }));
  },
  appendProgressCheckpointToRoom: (room, reason, turnId) => {
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
  },
  patchRoom: (roomId, patch) => {
    get().setState((current) => {
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
  },
  appendMessagesToRoom: (roomId, messages) => {
    get().setState((current) => {
      const room = current.rooms.find((item) => item.id === roomId);
      const sceneInstanceId = room ? getRoomActiveSceneInstanceId(room) : roomId;
      const sceneId = room?.activeSceneId;
      const updatedAt = Date.now();
      const shouldLockPresentation = hasTavernPresentationStarted(messages);
      const materializedMessages = messages.map((message) => ({
        ...message,
        sceneId: message.sceneId ?? sceneId,
        sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
      }));
      const nextSceneMessages = [...(current.messagesByInstance[sceneInstanceId] ?? []), ...materializedMessages];

      return {
        ...current,
        rooms: current.rooms.map((room) => {
          if (room.id !== roomId) {
            return room;
          }

          const presentation = normalizeTavernPresentation(room.presentation);
          const shouldWritePresentationLock = shouldLockPresentation && presentation.lockedSceneId !== sceneInstanceId;
          return {
            ...room,
            presentation: shouldWritePresentationLock
              ? {
                  ...presentation,
                  lockedAt: updatedAt,
                  lockedSceneId: sceneInstanceId,
                }
              : presentation,
            updatedAt,
          };
        }),
        messagesByInstance: {
          ...current.messagesByInstance,
          [sceneInstanceId]: nextSceneMessages,
        },
      };
    });
  },
  patchMessage: (messageId, patch) => {
    get().setState((current) => {
      let patchedSceneId = "";
      const nextMessagesByInstance = Object.fromEntries(
        Object.entries(current.messagesByInstance).map(([sceneId, messages]) => {
          const nextMessages = messages.map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            patchedSceneId = sceneId;
            const nextMessage = {
              ...message,
              ...patch,
            };
            const shouldRebuildSegments =
              !patch.segments &&
              (patch.content !== undefined ||
                patch.thought !== undefined ||
                patch.presentationProfileId !== undefined ||
                patch.role !== undefined ||
                patch.characterId !== undefined);
            return {
              ...nextMessage,
              kind:
                nextMessage.kind ??
                inferTavernMessageKind({
                  role: nextMessage.role,
                  presentationProfileId: nextMessage.presentationProfileId,
                }),
              segments: shouldRebuildSegments ? buildTavernMessageSegments(nextMessage) : nextMessage.segments,
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
        messagesByInstance: nextMessagesByInstance,
      };
    });
  },
  removeMessage: (messageId) => {
    get().setState((current) => {
      let removedSceneId = "";
      const nextMessagesByInstance = Object.fromEntries(
        Object.entries(current.messagesByInstance).map(([sceneId, messages]) => {
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
      const removedRoom = current.rooms.find((room) => getRoomActiveSceneInstanceId(room) === removedSceneId);

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          removedRoom && room.id === removedRoom.id ? { ...room, updatedAt: Date.now() } : room,
        ),
        messagesByInstance: nextMessagesByInstance,
      };
    });
  },
  reportError: (message) => {
    set({ error: message });
  },
}));

export const TavernPageProvider = ({
  children,
  workspace,
  runtimeModel,
}: TavernPageProviderProps & {
  children: ReactNode;
}) => {
  const isStoreInitializedRef = useRef(false);

  if (!isStoreInitializedRef.current) {
    useTavernPageStore.getState().resetForWorkspace(workspace, runtimeModel);
    isStoreInitializedRef.current = true;
  }

  useLayoutEffect(() => {
    useTavernPageStore.getState().configure({ workspace, runtimeModel });
  }, [runtimeModel, workspace]);

  return children;
};

export const useTavernPageContext = () => useTavernPageStore();
