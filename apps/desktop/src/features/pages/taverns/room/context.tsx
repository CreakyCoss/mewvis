import {
  getTavernRoomActiveCharacter,
  getTavernRoomCharacters,
  getTavernRoomSceneFields,
  type TavernRoomRuntime,
  type TavernRoomSessionState,
} from "@/features/pages/taverns/room/model";
import type { Dispatch, SetStateAction } from "react";
import { create } from "zustand";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import { getVisualPreset } from "@/features/pages/taverns/tavern/visual-presets";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets/types";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import {
  buildTavernMessageSegments,
  inferTavernMessageKind,
} from "@/features/pages/taverns/room/message/domain/segments";
import { getCurrentTimestamp } from "@/utils/time";
import type { ComposerHandle } from "./composer";
import type { ExecutionStep } from "./execution-trace";

export type TavernRoomBusyKind = "idle" | "sending";

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

const createEmptyTavernSessionState = (): TavernRoomSessionState => ({
  runtime: null,
  messages: [],
});

const getSessionStateRoom = (state: TavernRoomSessionState, roomId?: string) => {
  const room = state.runtime;
  return room && (!roomId || room.identity.id === roomId) ? room : null;
};

const replaceSessionStateRoom = (state: TavernRoomSessionState, room: TavernRoomRuntime): TavernRoomSessionState => ({
  ...state,
  runtime: room,
});

type TavernRoomDerivedState = {
  activeRoom: TavernRoomRuntime | null;
  visualPreset: VisualPresetDefinition;
  characterById: Map<string, TavernCharacter>;
  roomCharacters: TavernCharacter[];
  roomMessages: TavernMessage[];
  activeCharacter: TavernCharacter | null;
};

const deriveTavernRoomState = ({ state }: { state: TavernRoomSessionState }): TavernRoomDerivedState => {
  const activeRoom = state.runtime;
  const activeSceneFields = activeRoom ? getTavernRoomSceneFields(activeRoom) : null;
  const visualPreset = getVisualPreset(activeSceneFields?.scenePresetId);
  const roomCharacters = activeRoom ? getTavernRoomCharacters(activeRoom) : [];
  const characterById = new Map((activeRoom?.cast.characters ?? []).map((character) => [character.id, character]));
  const roomMessages = activeRoom ? state.messages : [];
  const activeCharacter = activeRoom ? getTavernRoomActiveCharacter(activeRoom) : null;

  return {
    activeRoom,
    visualPreset,
    characterById,
    roomCharacters,
    roomMessages,
    activeCharacter,
  };
};

type TavernRoomStoreBase = {
  workspace: Workspace;
  runtimeModel: RuntimeModelOption | null;
  state: TavernRoomSessionState;
  initialRuntime: TavernRoomRuntime | null;
  initialMessages: TavernMessage[];
  composerHandle: ComposerHandle | null;
  error: string;
  busy: TavernRoomBusyState;
  executionSteps: ExecutionStep[];
  executionTraceAnchorMessageId: string;
} & TavernRoomDerivedState;

type TavernRoomStoreActions = {
  resetRoomStore: (input?: {
    workspace?: Workspace;
    runtimeModel?: RuntimeModelOption | null;
    initialRuntime?: TavernRoomRuntime | null;
    initialMessages?: TavernMessage[];
  }) => void;
  setWorkspace: (workspace: Workspace) => void;
  setRuntimeModel: (runtimeModel: RuntimeModelOption | null) => void;
  setInitialRuntime: (runtime: TavernRoomRuntime | null) => void;
  setComposerHandle: (composerHandle: ComposerHandle | null) => void;
  setState: Dispatch<SetStateAction<TavernRoomSessionState>>;
  setError: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<TavernRoomBusyState>>;
  setBusyStatus: (status: string) => void;
  setExecutionSteps: Dispatch<SetStateAction<ExecutionStep[]>>;
  setExecutionTraceAnchorMessageId: Dispatch<SetStateAction<string>>;
  resetExecutionTrace: (steps: ExecutionStep[]) => void;
  patchExecutionStep: (stepId: string, patch: Partial<Omit<ExecutionStep, "id">>) => void;
  appendExecutionStep: (step: ExecutionStep) => void;
  upsertExecutionStep: (step: ExecutionStep) => void;
  patchRoom: (roomId: string, updater: (room: TavernRoomRuntime) => TavernRoomRuntime) => void;
  appendMessagesToRoom: (roomId: string, messages: TavernMessage[]) => void;
  patchMessage: (messageId: string, patch: Partial<TavernMessage>) => void;
  removeMessage: (messageId: string) => void;
  reportError: (message: string) => void;
};

export type TavernRoomStoreState = TavernRoomStoreBase & TavernRoomStoreActions;

const createBaseStoreState = (
  input: {
    workspace?: Workspace;
    runtimeModel?: RuntimeModelOption | null;
    initialRuntime?: TavernRoomRuntime | null;
    initialMessages?: TavernMessage[];
  } = {},
): TavernRoomStoreBase => {
  const state = createEmptyTavernSessionState();
  const initialRuntime = input.initialRuntime ?? null;

  return {
    workspace: input.workspace ?? EMPTY_WORKSPACE,
    runtimeModel: input.runtimeModel ?? null,
    state,
    initialRuntime,
    initialMessages: input.initialMessages ?? [],
    composerHandle: null,
    error: "",
    busy: createIdleTavernRoomBusyState(),
    executionSteps: [],
    executionTraceAnchorMessageId: "",
    ...deriveTavernRoomState({ state }),
  };
};

export const useTavernRoomContext = create<TavernRoomStoreState>((set) => ({
  ...createBaseStoreState(),
  resetRoomStore: (input) => {
    set(createBaseStoreState(input));
  },
  setWorkspace: (workspace) => {
    set({ workspace });
  },
  setRuntimeModel: (runtimeModel) => {
    set({ runtimeModel });
  },
  setInitialRuntime: (initialRuntime) => {
    set((current) => ({
      initialRuntime,
      ...deriveTavernRoomState({ state: current.state }),
    }));
  },
  setComposerHandle: (composerHandle) => {
    set({ composerHandle });
  },
  setState: (updater) => {
    set((current) => {
      const state = typeof updater === "function" ? updater(current.state) : updater;
      return {
        state,
        ...deriveTavernRoomState({ state }),
      };
    });
  },
  setError: (updater) => {
    set((current) => ({
      error: typeof updater === "function" ? updater(current.error) : updater,
    }));
  },
  setBusy: (updater) => {
    set((current) => ({
      busy: typeof updater === "function" ? updater(current.busy) : updater,
    }));
  },
  setBusyStatus: (status) => {
    set((current) => ({
      busy: {
        ...current.busy,
        status,
      },
    }));
  },
  setExecutionSteps: (updater) => {
    set((current) => ({
      executionSteps: typeof updater === "function" ? updater(current.executionSteps) : updater,
    }));
  },
  setExecutionTraceAnchorMessageId: (updater) => {
    set((current) => ({
      executionTraceAnchorMessageId:
        typeof updater === "function" ? updater(current.executionTraceAnchorMessageId) : updater,
    }));
  },
  resetExecutionTrace: (executionSteps) => {
    set({ executionSteps });
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
  patchRoom: (roomId, updater) => {
    set((current) => {
      const room = getSessionStateRoom(current.state, roomId);
      if (!room) {
        return current;
      }

      const state = replaceSessionStateRoom(current.state, updater(room));

      return {
        state,
        ...deriveTavernRoomState({ state }),
      };
    });
  },
  appendMessagesToRoom: (roomId, messages) => {
    set((current) => {
      const room = getSessionStateRoom(current.state, roomId);
      if (!room) {
        return current;
      }

      const updatedAt = getCurrentTimestamp();
      const state = {
        ...replaceSessionStateRoom(current.state, {
          ...room,
          identity: {
            ...room.identity,
            updatedAt,
          },
          config: {
            room: {
              ...room.config.room,
              updatedAt,
            },
          },
        }),
        messages: [...current.state.messages, ...messages],
      };

      return {
        state,
        ...deriveTavernRoomState({ state }),
      };
    });
  },
  patchMessage: (messageId, patch) => {
    set((current) => {
      let didPatch = false;
      const nextMessages = current.state.messages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        didPatch = true;
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

      if (!didPatch) {
        return current;
      }

      const state = {
        ...current.state,
        messages: nextMessages,
      };

      return {
        state,
        ...deriveTavernRoomState({ state }),
      };
    });
  },
  removeMessage: (messageId) => {
    set((current) => {
      let didRemove = false;
      const nextMessages = current.state.messages.filter((message) => {
        const shouldKeep = message.id !== messageId;
        if (!shouldKeep) {
          didRemove = true;
        }
        return shouldKeep;
      });

      if (!didRemove) {
        return current;
      }

      const state = {
        ...(current.state.runtime
          ? replaceSessionStateRoom(current.state, {
              ...current.state.runtime,
              identity: {
                ...current.state.runtime.identity,
                updatedAt: getCurrentTimestamp(),
              },
            })
          : current.state),
        messages: nextMessages,
      };

      return {
        state,
        ...deriveTavernRoomState({ state }),
      };
    });
  },
  reportError: (message) => {
    set({ error: message });
  },
}));
