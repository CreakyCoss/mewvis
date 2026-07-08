import type { TavernScenePromptOverrides, TavernRoomSettings } from "@/features/pages/taverns/manage/model";
import type {
  TavernCharacterMemoryLayers,
  TavernRoomRuntime,
  TavernScene,
  TavernSceneInstance,
  TavernSceneMemoryLayers,
} from "@/features/pages/taverns/room/model";
import { createEmptyCharacterMemoryLayers, createEmptySceneMemoryLayers } from "../../tavern/runtime/memory-layers";
import { normalizeScenePromptOverrides } from "../../tavern/runtime/scene-prompt-overrides";
import {
  selectTavernRuntimeActiveSceneFields,
  selectTavernRuntimeActiveSceneId,
  selectTavernRuntimeActiveSceneInstance,
} from "./accessors";

const touchRuntime = (runtime: TavernRoomRuntime, updatedAt = Date.now()): TavernRoomRuntime => ({
  ...runtime,
  identity: {
    ...runtime.identity,
    updatedAt,
  },
  config: {
    room: {
      ...runtime.config.room,
      updatedAt,
    },
  },
});

const patchSceneFields = <Scene extends TavernScene | TavernSceneInstance>(
  scene: Scene,
  patch: Partial<ReturnType<typeof selectTavernRuntimeActiveSceneFields>>,
  updatedAt: number,
): Scene => ({
  ...scene,
  scenePresetId: patch.scenePresetId ?? scene.scenePresetId,
  scene: patch.scene ?? scene.scene,
  sceneGoal: patch.sceneGoal ?? scene.sceneGoal,
  plot: patch.scenePlot ?? scene.plot,
  storyDirection: patch.sceneDirection ?? scene.storyDirection,
  transition: patch.sceneTransition ?? scene.transition,
  memory: patch.memory ?? scene.memory,
  relationshipOverrides: patch.relationshipOverrides ?? scene.relationshipOverrides,
  sceneStatus: patch.sceneStatus ?? scene.sceneStatus,
  characterPublicStatuses: patch.characterPublicStatuses ?? scene.characterPublicStatuses,
  characterPrivateStatuses: patch.characterPrivateStatuses ?? scene.characterPrivateStatuses,
  pendingInteractions: patch.pendingInteractions ?? scene.pendingInteractions,
  replyOptions: patch.replyOptions ?? scene.replyOptions,
  characterConfigs: patch.characterConfigs ?? scene.characterConfigs,
  characterMemories: patch.characterMemories ?? scene.characterMemories,
  characterIds: patch.characterIds ?? scene.characterIds,
  activeCharacterId: patch.activeCharacterId ?? scene.activeCharacterId,
  updatedAt,
});

export const patchTavernRuntimeSettings = (
  runtime: TavernRoomRuntime,
  settings: TavernRoomSettings,
): TavernRoomRuntime => {
  const updatedAt = Date.now();
  return {
    ...touchRuntime(runtime, updatedAt),
    config: {
      room: {
        ...runtime.config.room,
        settings,
        updatedAt,
      },
    },
    presentation: {
      ...runtime.presentation,
      settings,
    },
  };
};

export const patchTavernRuntimeActiveSceneFields = (
  runtime: TavernRoomRuntime,
  patch: Partial<ReturnType<typeof selectTavernRuntimeActiveSceneFields>>,
): TavernRoomRuntime => {
  const updatedAt = Date.now();
  const activeInstance = selectTavernRuntimeActiveSceneInstance(runtime);
  const activeSceneId = activeInstance?.sceneId ?? selectTavernRuntimeActiveSceneId(runtime);
  const nextSceneItems = runtime.scenes.items.map((scene) =>
    scene.id === activeSceneId ? patchSceneFields(scene, patch, updatedAt) : scene,
  );
  const nextSceneInstances = activeInstance
    ? runtime.scenes.instances.map((instance) =>
        instance.id === activeInstance.id ? patchSceneFields(instance, patch, updatedAt) : instance,
      )
    : runtime.scenes.instances;

  return {
    ...touchRuntime(runtime, updatedAt),
    presentation: {
      ...runtime.presentation,
      scenePresetId: patch.scenePresetId ?? runtime.presentation.scenePresetId,
    },
    cast: {
      ...runtime.cast,
      characterIds: patch.characterIds ?? runtime.cast.characterIds,
      activeCharacterId: patch.activeCharacterId ?? runtime.cast.activeCharacterId,
      characterConfigs: patch.characterConfigs ?? runtime.cast.characterConfigs,
      characterMemories: patch.characterMemories ?? runtime.cast.characterMemories,
    },
    scenes: {
      ...runtime.scenes,
      items: nextSceneItems,
      instances: nextSceneInstances,
      activeSceneId,
      activeSceneInstanceId: activeInstance?.id ?? runtime.scenes.activeSceneInstanceId,
    },
  };
};

export const switchTavernRuntimeSceneInstance = (
  runtime: TavernRoomRuntime,
  sceneInstanceId: string,
): TavernRoomRuntime => {
  const targetInstance = runtime.scenes.instances.find((instance) => instance.id === sceneInstanceId);
  if (!targetInstance) {
    return switchTavernRuntimeScene(runtime, sceneInstanceId);
  }

  const updatedAt = Date.now();
  return {
    ...touchRuntime(runtime, updatedAt),
    story: {
      ...runtime.story,
      activeNodeId: targetInstance.nodeId,
      graph: {
        ...runtime.story.graph,
        activeNodeId: targetInstance.nodeId,
      },
    },
    scenes: {
      ...runtime.scenes,
      activeSceneId: targetInstance.sceneId,
      activeSceneInstanceId: targetInstance.id,
    },
  };
};

export const switchTavernRuntimeScene = (runtime: TavernRoomRuntime, sceneId: string): TavernRoomRuntime => {
  const node =
    runtime.story.graph.nodes.find((item) => item.sceneId === sceneId) ??
    runtime.story.graph.nodes.find((item) => item.id === sceneId);
  const targetInstance =
    (node ? runtime.scenes.instances.find((instance) => instance.nodeId === node.id) : undefined) ??
    runtime.scenes.instances.find((instance) => instance.sceneId === sceneId);
  if (targetInstance) {
    return switchTavernRuntimeSceneInstance(runtime, targetInstance.id);
  }

  const targetScene = runtime.scenes.items.find((scene) => scene.id === sceneId);
  if (!targetScene) {
    return runtime;
  }

  const updatedAt = Date.now();
  return {
    ...touchRuntime(runtime, updatedAt),
    scenes: {
      ...runtime.scenes,
      activeSceneId: targetScene.id,
    },
  };
};

export const updateTavernRuntimeActiveSceneMemoryLayers = (
  runtime: TavernRoomRuntime,
  patch: Partial<TavernSceneMemoryLayers>,
): TavernRoomRuntime => {
  const activeInstance = selectTavernRuntimeActiveSceneInstance(runtime);
  if (!activeInstance) {
    return runtime;
  }

  const updatedAt = Date.now();
  return {
    ...touchRuntime(runtime, updatedAt),
    scenes: {
      ...runtime.scenes,
      instances: runtime.scenes.instances.map((instance) =>
        instance.id === activeInstance.id
          ? {
              ...instance,
              memoryLayers: {
                ...createEmptySceneMemoryLayers(instance.memoryLayers),
                ...patch,
                updatedAt,
              },
              updatedAt,
            }
          : instance,
      ),
    },
  };
};

export const updateTavernRuntimeActiveCharacterMemoryLayers = (
  runtime: TavernRoomRuntime,
  characterId: string,
  patch: Partial<TavernCharacterMemoryLayers>,
): TavernRoomRuntime => {
  const activeInstance = selectTavernRuntimeActiveSceneInstance(runtime);
  if (!activeInstance || !characterId) {
    return runtime;
  }

  const updatedAt = Date.now();
  return {
    ...touchRuntime(runtime, updatedAt),
    scenes: {
      ...runtime.scenes,
      instances: runtime.scenes.instances.map((instance) => {
        if (instance.id !== activeInstance.id) {
          return instance;
        }

        const characterMemoryLayers = { ...instance.characterMemoryLayers };
        characterMemoryLayers[characterId] = {
          ...createEmptyCharacterMemoryLayers(characterMemoryLayers[characterId]),
          ...patch,
          updatedAt,
        };

        return {
          ...instance,
          characterMemoryLayers,
          updatedAt,
        };
      }),
    },
  };
};

export const updateTavernRuntimeActiveScenePromptOverrides = (
  runtime: TavernRoomRuntime,
  overrides: Partial<TavernScenePromptOverrides>,
): TavernRoomRuntime => {
  const activeInstance = selectTavernRuntimeActiveSceneInstance(runtime);
  if (!activeInstance) {
    return runtime;
  }

  const updatedAt = Date.now();
  return {
    ...touchRuntime(runtime, updatedAt),
    scenes: {
      ...runtime.scenes,
      instances: runtime.scenes.instances.map((instance) =>
        instance.id === activeInstance.id
          ? {
              ...instance,
              promptOverrides: normalizeScenePromptOverrides(overrides),
              updatedAt,
            }
          : instance,
      ),
    },
  };
};
