import type { SetStateAction } from "react";
import { create } from "zustand";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import {
  getTavernRoomActiveCharacter,
  getTavernRoomCharacters,
  type TavernRoomRuntime,
  type TavernRoomSessionState,
} from "@/features/pages/taverns/room/model";
import { getVisualPreset } from "@/features/pages/taverns/tavern/visual-presets";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets/types";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
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

type TavernRoomDerivedState = {
  activeRoom: TavernRoomRuntime | null;
  visualPreset: VisualPresetDefinition;
  roomCharacters: TavernCharacter[];
  roomMessages: TavernMessage[];
  activeCharacter: TavernCharacter | null;
};

type TavernRoomStoreBase = {
  workspacePath: string;
  runtimeModel: RuntimeModelOption | null;
  state: TavernRoomSessionState;
  initialState: TavernRoomSessionState;
  composerHandle: ComposerHandle | null;
  error: string;
  busy: TavernRoomBusyState;
  executionSteps: ExecutionStep[];
  executionTraceAnchorMessageId: string;
} & TavernRoomDerivedState;

type TavernRoomStoreInitialization = {
  workspacePath: string;
  state: TavernRoomSessionState;
  initialState: TavernRoomSessionState;
};

type TavernRoomStoreActions = {
  initializeRoom: (input: TavernRoomStoreInitialization) => void;
  setRuntimeModel: (runtimeModel: RuntimeModelOption | null) => void;
  setComposerHandle: (composerHandle: ComposerHandle | null) => void;
  setSession: (state: TavernRoomSessionState) => void;
  setError: (error: string) => void;
  setBusy: (busy: TavernRoomBusyState) => void;
  setBusyStatus: (status: string) => void;
  setExecutionSteps: (updater: SetStateAction<ExecutionStep[]>) => void;
  setExecutionTraceAnchorMessageId: (messageId: string) => void;
  patchExecutionStep: (stepId: string, patch: Partial<Omit<ExecutionStep, "id">>) => void;
  upsertExecutionStep: (step: ExecutionStep) => void;
  patchRoom: (roomId: string, updater: (room: TavernRoomRuntime) => TavernRoomRuntime) => void;
  appendMessagesToRoom: (roomId: string, messages: TavernMessage[]) => void;
};

export type TavernRoomStoreState = TavernRoomStoreBase & TavernRoomStoreActions;

const createEmptySessionState = (): TavernRoomSessionState => ({
  runtime: null,
  messages: [],
});

const deriveRoomState = (state: TavernRoomSessionState): TavernRoomDerivedState => {
  const activeRoom = state.runtime;
  return {
    activeRoom,
    visualPreset: getVisualPreset(activeRoom?.scene.scenePresetId),
    roomCharacters: activeRoom ? getTavernRoomCharacters(activeRoom) : [],
    roomMessages: activeRoom ? state.messages : [],
    activeCharacter: activeRoom ? getTavernRoomActiveCharacter(activeRoom) : null,
  };
};

const createBaseStoreState = (
  input?: TavernRoomStoreInitialization,
  runtimeModel: RuntimeModelOption | null = null,
): TavernRoomStoreBase => {
  const state = input?.state ?? createEmptySessionState();
  return {
    workspacePath: input?.workspacePath.trim() ?? "",
    runtimeModel,
    state,
    initialState: input?.initialState ?? createEmptySessionState(),
    composerHandle: null,
    error: "",
    busy: createIdleTavernRoomBusyState(),
    executionSteps: [],
    executionTraceAnchorMessageId: "",
    ...deriveRoomState(state),
  };
};

const getSessionRoom = (state: TavernRoomSessionState, roomId: string) => {
  const room = state.runtime;
  return room?.identity.id === roomId ? room : null;
};

const replaceSessionRoom = (state: TavernRoomSessionState, room: TavernRoomRuntime): TavernRoomSessionState => ({
  ...state,
  runtime: room,
});

export const useTavernRoomContext = create<TavernRoomStoreState>((set) => ({
  ...createBaseStoreState(),
  initializeRoom: (input) => {
    set((current) => createBaseStoreState(input, current.runtimeModel));
  },
  setRuntimeModel: (runtimeModel) => {
    set({ runtimeModel });
  },
  setComposerHandle: (composerHandle) => {
    set({ composerHandle });
  },
  setSession: (state) => {
    set({ state, ...deriveRoomState(state) });
  },
  setError: (error) => {
    set({ error });
  },
  setBusy: (busy) => {
    set({ busy });
  },
  setBusyStatus: (status) => {
    set((current) => ({ busy: { ...current.busy, status } }));
  },
  setExecutionSteps: (updater) => {
    set((current) => ({
      executionSteps: typeof updater === "function" ? updater(current.executionSteps) : updater,
    }));
  },
  setExecutionTraceAnchorMessageId: (executionTraceAnchorMessageId) => {
    set({ executionTraceAnchorMessageId });
  },
  patchExecutionStep: (stepId, patch) => {
    set((current) => ({
      executionSteps: current.executionSteps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
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
      const room = getSessionRoom(current.state, roomId);
      if (!room) {
        return current;
      }

      const state = replaceSessionRoom(current.state, updater(room));
      return { state, ...deriveRoomState(state) };
    });
  },
  appendMessagesToRoom: (roomId, messages) => {
    set((current) => {
      const room = getSessionRoom(current.state, roomId);
      if (!room) {
        return current;
      }

      const updatedAt = getCurrentTimestamp();
      const state = {
        ...replaceSessionRoom(current.state, {
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

      return { state, ...deriveRoomState(state) };
    });
  },
}));
