import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  TavernState,
} from "./types";
import {
  createDefaultTavernState,
  normalizeTavernState,
} from "./state-normalizer";

export {
  getActiveTavernScene,
  getActiveTavernStoryNode,
  getTavernSceneDisplayTitle,
  getTavernSceneInstanceDisplayTitle,
} from "./scene-selectors";
export {
  createTavernMessage,
} from "./message";
export {
  createTavernScene,
} from "./scene-builder";
export {
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_ROOM_SETTINGS,
  DEFAULT_TAVERN_SCENE_OUTCOMES,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
  DEFAULT_TAVERN_TASK_DEFINITIONS,
} from "./defaults";
export {
  createTavernAssetDraft,
  createTavernIllustrationHint,
  createTavernLorebookEntry,
} from "./asset-factories";
export {
  parseTavernGeneratedPresetJsonText,
} from "./generated-preset-parser";
export {
  createTavernRoomFromGeneratedPresetJson,
} from "./generated-preset-room";
export {
  createTavernCharacter,
  createTavernRoom,
} from "./manual-factories";
export {
  addTavernSecretMemoryEntry,
  findTavernSceneInstanceIdForNode,
  getActiveTavernSceneInstance,
  listTavernBranchSecretMemoryEntries,
  loadTavernBranchUpstreamMemory,
  projectTavernSceneOntoRoom,
  revealTavernSecretMemory,
  switchTavernRoomScene,
  switchTavernRoomSceneInstance,
  switchTavernRoomStoryNode,
  syncTavernRoomActiveScene,
  updateTavernActiveCharacterMemoryLayers,
  updateTavernActiveSceneMemoryLayers,
  updateTavernActiveScenePromptOverrides,
} from "./active-scene-runtime";
export type {
  TavernBranchSecretMemoryOption,
  TavernBranchUpstreamMemoryLoadResult,
  TavernSecretMemoryTarget,
} from "./active-scene-runtime";
export {
  getTavernSystemPreset,
  tavernSystemPresets,
} from "./system-preset-registry";
export {
  createTavernRoomFromSystemPreset,
} from "./system-preset-room";
export {
  createDefaultTavernState,
} from "./state-normalizer";
export type {
  TavernSystemPreset,
} from "./system-preset-registry";

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const loadTavernStateFromLocalStorage = (workspaceId: string): TavernState => {
  if (typeof window === "undefined") {
    return createDefaultTavernState(workspaceId);
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForWorkspace(workspaceId));
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeTavernState(workspaceId, parsed) ?? createDefaultTavernState(workspaceId);
  } catch {
    return createDefaultTavernState(workspaceId);
  }
};

const saveTavernStateToLocalStorage = (workspaceId: string, state: TavernState) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;
  window.localStorage.setItem(storageKeyForWorkspace(workspaceId), JSON.stringify(normalizedState));
};

const deleteTavernStateFromLocalStorage = (workspaceId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKeyForWorkspace(workspaceId));
};

export const loadTavernState = async (
  workspacePath: string,
  workspaceId: string,
): Promise<TavernState> => {
  if (!isTauri()) {
    return loadTavernStateFromLocalStorage(workspaceId);
  }

  deleteTavernStateFromLocalStorage(workspaceId);
  const storedState = await invoke<unknown | null>("load_tavern_state", {
    input: { workspacePath },
  });

  return normalizeTavernState(workspaceId, storedState) ?? createDefaultTavernState(workspaceId);
};

export const saveTavernState = async (
  workspacePath: string,
  workspaceId: string,
  state: TavernState,
) => {
  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;

  if (!isTauri()) {
    saveTavernStateToLocalStorage(workspaceId, normalizedState);
    return normalizedState;
  }

  deleteTavernStateFromLocalStorage(workspaceId);
  await invoke("save_tavern_state", {
    input: { workspacePath, state: normalizedState },
  });
  return normalizedState;
};
