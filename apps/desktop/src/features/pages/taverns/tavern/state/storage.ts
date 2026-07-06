import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernState } from "../types";
import { createDefaultTavernState, normalizeTavernState } from "./state-normalizer";

const STORAGE_PREFIX = "novel-claw:tavern";

export type TavernRuntimeScope = {
  storyId?: string;
  storyNodeId?: string;
  tavernId?: string;
  runtimePath?: string;
};

const storageKeyForWorkspace = (workspaceId: string, scope: TavernRuntimeScope = {}) =>
  [STORAGE_PREFIX, workspaceId, scope.storyId, scope.tavernId, scope.runtimePath].filter(Boolean).join(":");

const isStoryTavernScope = (scope: TavernRuntimeScope = {}) =>
  Boolean(scope.storyId && scope.tavernId);

const createEmptyTavernState = (): TavernState => ({
  version: 4,
  activeRoomId: "",
  rooms: [],
  messagesByInstance: {},
  workflowTracesByInstance: {},
});

const createFallbackTavernState = (
  workspaceId: string,
  scope?: TavernRuntimeScope,
) => isStoryTavernScope(scope)
  ? createEmptyTavernState()
  : createDefaultTavernState(workspaceId);

const normalizeStateForScope = (
  workspaceId: string,
  value: unknown,
  scope?: TavernRuntimeScope,
) => normalizeTavernState(workspaceId, value, {
  includeDefaultRooms: !isStoryTavernScope(scope),
});

const selectStateForScope = (
  state: TavernState,
  scope?: TavernRuntimeScope,
): TavernState => {
  if (!isStoryTavernScope(scope)) {
    return state;
  }

  const rooms = state.rooms.filter((room) => room.id === scope?.tavernId);
  if (rooms.length === 0) {
    return state;
  }

  const instanceIds = new Set(
    rooms.flatMap((room) => [
      room.activeSceneInstanceId,
      ...room.sceneInstances.map((instance) => instance.id),
    ].filter((value): value is string => Boolean(value))),
  );

  return {
    ...state,
    activeRoomId: rooms.some((room) => room.id === state.activeRoomId)
      ? state.activeRoomId
      : rooms[0]?.id ?? "",
    rooms,
    messagesByInstance: Object.fromEntries(
      Object.entries(state.messagesByInstance).filter(([instanceId]) => instanceIds.has(instanceId)),
    ),
    workflowTracesByInstance: Object.fromEntries(
      Object.entries(state.workflowTracesByInstance).filter(([instanceId]) => instanceIds.has(instanceId)),
    ),
  };
};

const loadTavernStateFromLocalStorage = async (
  workspaceId: string,
  scope?: TavernRuntimeScope,
): Promise<TavernState> => {
  if (typeof window === "undefined") {
    return createFallbackTavernState(workspaceId, scope);
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForWorkspace(workspaceId, scope));
    const parsed = raw ? JSON.parse(raw) : null;
    const normalizedState = normalizeStateForScope(workspaceId, parsed, scope);
    return normalizedState
      ? selectStateForScope(normalizedState, scope)
      : createFallbackTavernState(workspaceId, scope);
  } catch {
    return createFallbackTavernState(workspaceId, scope);
  }
};

const saveTavernStateToLocalStorage = (
  workspaceId: string,
  state: TavernState,
  scope?: TavernRuntimeScope,
) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedState = normalizeStateForScope(workspaceId, state, scope) ?? state;
  window.localStorage.setItem(
    storageKeyForWorkspace(workspaceId, scope),
    JSON.stringify(selectStateForScope(normalizedState, scope)),
  );
};

const deleteTavernStateFromLocalStorage = (workspaceId: string, scope?: TavernRuntimeScope) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKeyForWorkspace(workspaceId, scope));
};

export const loadTavernState = async (
  workspacePath: string,
  workspaceId: string,
  scope: TavernRuntimeScope = {},
): Promise<TavernState> => {
  if (!isTauri()) {
    return loadTavernStateFromLocalStorage(workspaceId, scope);
  }

  deleteTavernStateFromLocalStorage(workspaceId, scope);
  const storedState = await invoke<unknown | null>("load_tavern_state", {
    input: {
      workspacePath,
      storyId: scope.storyId,
      tavernId: scope.tavernId,
      runtimePath: scope.runtimePath,
    },
  });

  const normalizedState = normalizeStateForScope(workspaceId, storedState, scope);
  return normalizedState
    ? selectStateForScope(normalizedState, scope)
    : createFallbackTavernState(workspaceId, scope);
};

export const saveTavernState = async (
  workspacePath: string,
  workspaceId: string,
  state: TavernState,
  scope: TavernRuntimeScope = {},
) => {
  const normalizedState = normalizeStateForScope(workspaceId, state, scope) ?? state;
  const stateForStorage = selectStateForScope(normalizedState, scope);

  if (!isTauri()) {
    saveTavernStateToLocalStorage(workspaceId, normalizedState, scope);
    return normalizedState;
  }

  deleteTavernStateFromLocalStorage(workspaceId, scope);
  await invoke("save_tavern_state", {
    input: {
      workspacePath,
      storyId: scope.storyId,
      tavernId: scope.tavernId,
      runtimePath: scope.runtimePath,
      state: stateForStorage,
    },
  });
  return normalizedState;
};

export const clearTavernState = async (workspacePath: string, workspaceId: string, scope: TavernRuntimeScope = {}) => {
  if (!isTauri()) {
    deleteTavernStateFromLocalStorage(workspaceId, scope);
    return;
  }

  deleteTavernStateFromLocalStorage(workspaceId, scope);
  await invoke("clear_tavern_state", {
    input: {
      workspacePath,
      storyId: scope.storyId,
      tavernId: scope.tavernId,
      runtimePath: scope.runtimePath,
    },
  });
};
