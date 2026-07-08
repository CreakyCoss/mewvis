import { cloneDeep } from "lodash-es";
import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { projectTavernSceneOntoRoom } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { projectTavernSceneFieldsOntoRoom } from "@/features/pages/taverns/tavern/runtime/scene-field-projection";
import type { TavernRoomRuntime, TavernActiveRoomView } from "../model";

export const createTavernRoomRuntimeFromView = (room: TavernActiveRoomView): TavernRoomRuntime => {
  const roomConfig = cloneDeep(room) as TavernRoomConfig;

  return {
    version: 1,
    identity: {
      id: room.id,
      workspaceId: room.workspaceId,
      title: room.title,
      systemPresetId: room.systemPresetId,
      systemPresetVersion: room.systemPresetVersion,
      creationSource: room.creationSource,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    },
    config: {
      room: roomConfig,
    },
    presentation: {
      profile: room.presentation,
      prompt: room.prompt,
      settings: room.settings,
      scenePresetId: room.scenePresetId,
      replyMode: room.replyMode,
    },
    story: {
      binding: room.storyBinding,
      outline: room.storyOutline,
      goal: room.storyGoal,
      graph: room.storyGraph,
      activeNodeId: room.storyGraph.activeNodeId,
    },
    cast: {
      characters: room.localCharacters ?? [],
      characterIds: [...room.characterIds],
      activeCharacterId: room.activeCharacterId,
      characterConfigs: room.characterConfigs,
      characterMemories: { ...room.characterMemories },
    },
    scenes: {
      items: room.scenes ?? [],
      activeSceneId: room.activeSceneId,
      instances: room.sceneInstances ?? [],
      activeSceneInstanceId: room.activeSceneInstanceId,
    },
    world: {
      lorebookEntries: room.lorebookEntries,
    },
    user: {
      personaName: room.userPersonaName,
    },
  };
};

const patchConfigRoomFromRuntime = (runtime: TavernRoomRuntime): TavernRoomConfig => ({
  ...runtime.config.room,
  id: runtime.identity.id,
  workspaceId: runtime.identity.workspaceId,
  title: runtime.identity.title,
  systemPresetId: runtime.identity.systemPresetId,
  systemPresetVersion: runtime.identity.systemPresetVersion,
  creationSource: runtime.identity.creationSource,
  presentation: runtime.presentation.profile,
  prompt: runtime.presentation.prompt,
  settings: runtime.presentation.settings,
  scenePresetId: runtime.presentation.scenePresetId,
  replyMode: runtime.presentation.replyMode,
  createdAt: runtime.identity.createdAt,
  updatedAt: runtime.identity.updatedAt,
});

export const selectTavernActiveRoomView = (runtime: TavernRoomRuntime): TavernActiveRoomView => {
  const activeSceneInstance =
    runtime.scenes.instances.find((instance) => instance.id === runtime.scenes.activeSceneInstanceId) ??
    runtime.scenes.instances.find((instance) => instance.nodeId === runtime.story.activeNodeId) ??
    runtime.scenes.instances[0] ??
    null;
  const activeScene =
    (activeSceneInstance?.sceneId
      ? runtime.scenes.items.find((scene) => scene.id === activeSceneInstance.sceneId)
      : undefined) ??
    runtime.scenes.items.find((scene) => scene.id === runtime.scenes.activeSceneId) ??
    runtime.scenes.items[0] ??
    activeSceneInstance;
  const activeSceneFields = activeScene
    ? projectTavernSceneFieldsOntoRoom(activeScene)
    : {
        scene: "",
        sceneGoal: "",
        scenePlot: "",
        sceneDirection: "",
        sceneTransition: "",
        memory: "",
        relationshipOverrides: [],
        characterPublicStatuses: {},
        characterPrivateStatuses: {},
        pendingInteractions: [],
        replyOptions: [],
      };

  return projectTavernSceneOntoRoom({
    ...patchConfigRoomFromRuntime(runtime),
    storyBinding: runtime.story.binding,
    storyOutline: runtime.story.outline,
    storyGoal: runtime.story.goal,
    storyGraph: {
      ...runtime.story.graph,
      activeNodeId: activeSceneInstance?.nodeId ?? runtime.story.activeNodeId,
    },
    activeSceneInstanceId: activeSceneInstance?.id ?? runtime.scenes.activeSceneInstanceId,
    sceneInstances: runtime.scenes.instances,
    activeSceneId: activeSceneInstance?.sceneId ?? runtime.scenes.activeSceneId,
    scenes: runtime.scenes.items,
    ...activeSceneFields,
    characterConfigs: runtime.cast.characterConfigs,
    characterMemories: runtime.cast.characterMemories,
    localCharacters: runtime.cast.characters,
    lorebookEntries: runtime.world.lorebookEntries,
    characterIds: runtime.cast.characterIds,
    activeCharacterId: runtime.cast.activeCharacterId,
    userPersonaName: runtime.user.personaName,
  });
};
