import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type {
  TavernRoomRuntime,
  TavernScene,
  TavernSceneInstance,
  TavernStoryNode,
} from "@/features/pages/taverns/room/model";
import { extractTavernSceneFields } from "@/features/pages/taverns/tavern/runtime/scene-fields";

export const selectTavernRuntimeRoomConfig = (runtime: TavernRoomRuntime): TavernRoomConfig => ({
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

export const selectTavernRuntimeActiveNode = (runtime: TavernRoomRuntime): TavernStoryNode | null => {
  const graph = runtime.story.graph;
  return (
    graph.nodes.find((node) => node.id === runtime.story.activeNodeId) ??
    graph.nodes.find((node) => node.id === graph.activeNodeId) ??
    graph.nodes.find((node) => node.id === graph.entryNodeId) ??
    graph.nodes[0] ??
    null
  );
};

export const selectTavernRuntimeActiveSceneInstance = (runtime: TavernRoomRuntime): TavernSceneInstance | null => {
  const activeNode = selectTavernRuntimeActiveNode(runtime);
  const explicitInstance = runtime.scenes.instances.find(
    (instance) => instance.id === runtime.scenes.activeSceneInstanceId,
  );
  if (explicitInstance) {
    return explicitInstance;
  }

  return (
    (activeNode ? runtime.scenes.instances.find((instance) => instance.nodeId === activeNode.id) : undefined) ??
    runtime.scenes.instances.find((instance) => instance.sceneId === runtime.scenes.activeSceneId) ??
    runtime.scenes.instances[0] ??
    null
  );
};

export const selectTavernRuntimeActiveScene = (
  runtime: TavernRoomRuntime,
): TavernScene | TavernSceneInstance | null => {
  const activeInstance = selectTavernRuntimeActiveSceneInstance(runtime);
  if (activeInstance) {
    return activeInstance;
  }

  const activeNode = selectTavernRuntimeActiveNode(runtime);
  return (
    (activeNode?.sceneId ? runtime.scenes.items.find((scene) => scene.id === activeNode.sceneId) : undefined) ??
    runtime.scenes.items.find((scene) => scene.id === runtime.scenes.activeSceneId) ??
    runtime.scenes.items[0] ??
    null
  );
};

export const selectTavernRuntimeActiveSceneId = (runtime: TavernRoomRuntime) =>
  selectTavernRuntimeActiveSceneInstance(runtime)?.sceneId ??
  runtime.scenes.activeSceneId ??
  selectTavernRuntimeActiveScene(runtime)?.id ??
  runtime.identity.id;

export const selectTavernRuntimeActiveSceneInstanceId = (runtime: TavernRoomRuntime) =>
  selectTavernRuntimeActiveSceneInstance(runtime)?.id ?? selectTavernRuntimeActiveSceneId(runtime);

export const selectTavernRuntimeActiveSceneFields = (runtime: TavernRoomRuntime) => {
  const activeScene = selectTavernRuntimeActiveScene(runtime);
  return activeScene
    ? extractTavernSceneFields(activeScene)
    : {
        scenePresetId: runtime.presentation.scenePresetId,
        scene: "",
        sceneGoal: "",
        scenePlot: "",
        sceneDirection: "",
        sceneTransition: "",
        memory: "",
        relationshipOverrides: [],
        sceneStatus: undefined,
        characterPublicStatuses: {},
        characterPrivateStatuses: {},
        pendingInteractions: [],
        replyOptions: [],
        characterConfigs: runtime.cast.characterConfigs ?? {},
        characterMemories: runtime.cast.characterMemories,
        characterIds: runtime.cast.characterIds,
        activeCharacterId: runtime.cast.activeCharacterId,
      };
};

export const selectTavernRuntimeCharacters = (runtime: TavernRoomRuntime): TavernCharacter[] => {
  const characterById = new Map(runtime.cast.characters.map((character) => [character.id, character]));
  const orderedCharacters = runtime.cast.characterIds
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is TavernCharacter => Boolean(character));

  return orderedCharacters.length > 0 ? orderedCharacters : runtime.cast.characters;
};

export const selectTavernRuntimeActiveCharacter = (runtime: TavernRoomRuntime) => {
  const characters = selectTavernRuntimeCharacters(runtime);
  const sceneFields = selectTavernRuntimeActiveSceneFields(runtime);
  const activeCharacterId = sceneFields.activeCharacterId || runtime.cast.activeCharacterId;
  return characters.find((character) => character.id === activeCharacterId) ?? characters[0] ?? null;
};

export const selectTavernRuntimeActivePromptOverrides = (runtime: TavernRoomRuntime) =>
  selectTavernRuntimeActiveSceneInstance(runtime)?.promptOverrides;
