import type { TavernRoomSessionState, TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { Dispatch, SetStateAction } from "react";
import { create } from "zustand";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import { getVisualPreset, type VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernRuntimeScope } from "@/features/pages/taverns/storage";
import { buildTavernMessageSegments, inferTavernMessageKind } from "@/features/pages/taverns/room/message";
import {
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
  switchTavernRoomScene,
  switchTavernRoomSceneInstance,
} from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import type { ComposerHandle } from "./composer";
import type { ExecutionStep } from "./execution-trace";

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
  room: null,
  messages: [],
});

export const createTavernRoomInitialState = ({
  room,
  initialMessages = [],
  sceneInstanceId,
}: {
  room: TavernRoom;
  initialMessages?: TavernMessage[];
  sceneInstanceId?: string;
}) => {
  const nextRoom = sceneInstanceId
    ? switchTavernRoomSceneInstance(room, sceneInstanceId)
    : syncTavernRoomActiveScene(room);
  const messages = initialMessages.map((message) => ({
    ...message,
    roomId: message.roomId || nextRoom.id,
    status: message.status === "streaming" ? ("done" as const) : message.status,
  }));

  return {
    room: nextRoom,
    messages,
  } satisfies TavernRoomSessionState;
};

const getSessionStateRoom = (state: TavernRoomSessionState, roomId?: string) =>
  state.room && (!roomId || state.room.id === roomId) ? state.room : null;

const replaceSessionStateRoom = (state: TavernRoomSessionState, room: TavernRoom): TavernRoomSessionState => ({
  ...state,
  room,
});

type TavernRoomDerivedState = {
  activeRoom: TavernRoom | null;
  visualPreset: VisualPresetDefinition;
  characterById: Map<string, TavernCharacter>;
  roomCharacters: TavernCharacter[];
  roomMessages: TavernMessage[];
  activeCharacter: TavernCharacter | null;
};

const deriveTavernRoomState = ({
  initialRoom,
  state,
}: {
  initialRoom: TavernRoom | null;
  state: TavernRoomSessionState;
}): TavernRoomDerivedState => {
  const stateRoom = getSessionStateRoom(state, initialRoom?.id);
  const sourceRoom = stateRoom ?? initialRoom;
  const activeRoom = sourceRoom ? projectTavernSceneOntoRoom(sourceRoom) : null;
  const visualPreset = getVisualPreset(activeRoom?.scenePresetId);
  const characterById = new Map((activeRoom?.localCharacters ?? []).map((character) => [character.id, character]));
  const roomCharacters = activeRoom
    ? activeRoom.characterIds
        .map((characterId) => characterById.get(characterId))
        .filter((character): character is TavernCharacter => Boolean(character))
    : [];
  const roomMessages = activeRoom ? state.messages : [];
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

type TavernRoomStoreBase = {
  workspace: Workspace;
  runtimeScope: TavernRuntimeScope | undefined;
  runtimeModel: RuntimeModelOption | null;
  state: TavernRoomSessionState;
  initialRoom: TavernRoom | null;
  initialMessages: TavernMessage[];
  initialSceneInstanceId: string | undefined;
  composerHandle: ComposerHandle | null;
  error: string;
  busy: TavernRoomBusyState;
  executionSteps: ExecutionStep[];
  executionTraceAnchorMessageId: string;
} & TavernRoomDerivedState;

type TavernRoomStoreActions = {
  resetRoomStore: (input?: {
    workspace?: Workspace;
    runtimeScope?: TavernRuntimeScope;
    runtimeModel?: RuntimeModelOption | null;
    initialRoom?: TavernRoom | null;
    initialMessages?: TavernMessage[];
    initialSceneInstanceId?: string;
  }) => void;
  setWorkspace: (workspace: Workspace) => void;
  setRuntimeModel: (runtimeModel: RuntimeModelOption | null) => void;
  setInitialRoom: (room: TavernRoom | null) => void;
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
  selectRoomSceneInstance: (roomId: string, sceneInstanceId: string) => void;
  patchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  appendMessagesToRoom: (roomId: string, messages: TavernMessage[]) => void;
  patchMessage: (messageId: string, patch: Partial<TavernMessage>) => void;
  removeMessage: (messageId: string) => void;
  reportError: (message: string) => void;
};

export type TavernRoomStoreState = TavernRoomStoreBase & TavernRoomStoreActions;

const createBaseStoreState = (
  input: {
    workspace?: Workspace;
    runtimeScope?: TavernRuntimeScope;
    runtimeModel?: RuntimeModelOption | null;
    initialRoom?: TavernRoom | null;
    initialMessages?: TavernMessage[];
    initialSceneInstanceId?: string;
  } = {},
): TavernRoomStoreBase => {
  const state = createEmptyTavernSessionState();
  const initialRoom = input.initialRoom ?? null;

  return {
    workspace: input.workspace ?? EMPTY_WORKSPACE,
    runtimeScope: input.runtimeScope,
    runtimeModel: input.runtimeModel ?? null,
    state,
    initialRoom,
    initialMessages: input.initialMessages ?? [],
    initialSceneInstanceId: input.initialSceneInstanceId,
    composerHandle: null,
    error: "",
    busy: createIdleTavernRoomBusyState(),
    executionSteps: [],
    executionTraceAnchorMessageId: "",
    ...deriveTavernRoomState({ initialRoom, state }),
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
  setInitialRoom: (initialRoom) => {
    set((current) => ({
      initialRoom,
      ...deriveTavernRoomState({ initialRoom, state: current.state }),
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
        ...deriveTavernRoomState({ initialRoom: current.initialRoom, state }),
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
  selectRoomSceneInstance: (roomId, sceneInstanceId) => {
    set((current) => {
      const targetRoom = getSessionStateRoom(current.state, roomId);
      if (!targetRoom) {
        return current;
      }

      const nextRoom = targetRoom.sceneInstances.some((instance) => instance.id === sceneInstanceId)
        ? switchTavernRoomSceneInstance(targetRoom, sceneInstanceId)
        : switchTavernRoomScene(targetRoom, sceneInstanceId);
      const state = replaceSessionStateRoom(current.state, nextRoom);

      return {
        state,
        ...deriveTavernRoomState({ initialRoom: current.initialRoom, state }),
      };
    });
  },
  patchRoom: (roomId, patch) => {
    set((current) => {
      const room = getSessionStateRoom(current.state, roomId);
      if (!room) {
        return current;
      }

      const patchedRoom = syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(room),
        ...patch,
        updatedAt: Date.now(),
      });
      const state = replaceSessionStateRoom(current.state, patchedRoom);

      return {
        state,
        ...deriveTavernRoomState({ initialRoom: current.initialRoom, state }),
      };
    });
  },
  appendMessagesToRoom: (roomId, messages) => {
    set((current) => {
      const room = getSessionStateRoom(current.state, roomId);
      if (!room) {
        return current;
      }

      const state = {
        ...replaceSessionStateRoom(current.state, {
          ...room,
          updatedAt: Date.now(),
        }),
        messages: [...current.state.messages, ...messages],
      };

      return {
        state,
        ...deriveTavernRoomState({ initialRoom: current.initialRoom, state }),
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
        ...deriveTavernRoomState({ initialRoom: current.initialRoom, state }),
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

      const room = current.state.room;
      const state = {
        ...(room
          ? replaceSessionStateRoom(current.state, {
              ...room,
              updatedAt: Date.now(),
            })
          : current.state),
        messages: nextMessages,
      };

      return {
        state,
        ...deriveTavernRoomState({ initialRoom: current.initialRoom, state }),
      };
    });
  },
  reportError: (message) => {
    set({ error: message });
  },
}));
