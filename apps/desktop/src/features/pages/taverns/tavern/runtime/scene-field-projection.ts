import type { TavernRoom, TavernScene, TavernSceneInstance } from "@/features/pages/taverns/manage/model";

export type TavernProjectableScene = Pick<
  TavernScene,
  | "scenePresetId"
  | "scene"
  | "sceneGoal"
  | "plot"
  | "storyDirection"
  | "transition"
  | "memory"
  | "relationshipOverrides"
  | "sceneStatus"
  | "characterPublicStatuses"
  | "characterPrivateStatuses"
  | "pendingInteractions"
  | "replyOptions"
  | "factEvents"
  | "statusEvents"
  | "statusSnapshot"
  | "previousStatusSnapshot"
  | "statusCheckpoints"
  | "taskDefinitions"
  | "taskEvents"
  | "taskSnapshot"
  | "sceneOutcomes"
  | "outcomeEvents"
  | "characterConfigs"
  | "characterMemories"
  | "illustrationHints"
  | "assetDrafts"
  | "characterIds"
  | "activeCharacterId"
>;

const projectSceneNarrativeFieldsToRoom = (scene: TavernProjectableScene) => ({
  scenePresetId: scene.scenePresetId,
  scene: scene.scene,
  sceneGoal: scene.sceneGoal,
  scenePlot: scene.plot,
  sceneDirection: scene.storyDirection,
  sceneTransition: scene.transition,
  memory: scene.memory,
  relationshipOverrides: scene.relationshipOverrides,
});

const projectSceneInteractionFieldsToRoom = (scene: TavernProjectableScene) => ({
  sceneStatus: scene.sceneStatus,
  characterPublicStatuses: scene.characterPublicStatuses,
  characterPrivateStatuses: scene.characterPrivateStatuses,
  pendingInteractions: scene.pendingInteractions,
  replyOptions: scene.replyOptions,
});

const projectSceneProgressFieldsToRoom = (scene: TavernProjectableScene) => ({
  factEvents: scene.factEvents,
  statusEvents: scene.statusEvents,
  statusSnapshot: scene.statusSnapshot,
  previousStatusSnapshot: scene.previousStatusSnapshot,
  statusCheckpoints: scene.statusCheckpoints,
  taskDefinitions: scene.taskDefinitions,
  taskEvents: scene.taskEvents,
  taskSnapshot: scene.taskSnapshot,
  sceneOutcomes: scene.sceneOutcomes,
  outcomeEvents: scene.outcomeEvents,
});

const projectSceneAssetFieldsToRoom = (scene: TavernProjectableScene) => ({
  illustrationHints: scene.illustrationHints,
  assetDrafts: scene.assetDrafts,
});

const projectSceneCharacterFieldsToRoom = (scene: TavernProjectableScene) => ({
  characterConfigs: scene.characterConfigs ?? {},
  characterMemories: scene.characterMemories,
  characterIds: scene.characterIds,
  activeCharacterId: scene.activeCharacterId,
});

export const projectTavernSceneFieldsOntoRoom = (scene: TavernProjectableScene) => ({
  ...projectSceneNarrativeFieldsToRoom(scene),
  ...projectSceneInteractionFieldsToRoom(scene),
  ...projectSceneProgressFieldsToRoom(scene),
  ...projectSceneAssetFieldsToRoom(scene),
  ...projectSceneCharacterFieldsToRoom(scene),
});

const projectRoomNarrativeFieldsToScene = (room: TavernRoom) => ({
  scenePresetId: room.scenePresetId,
  scene: room.scene,
  sceneGoal: room.sceneGoal,
  plot: room.scenePlot,
  storyDirection: room.sceneDirection,
  transition: room.sceneTransition,
  memory: room.memory,
  relationshipOverrides: room.relationshipOverrides,
});

const projectRoomInteractionFieldsToScene = (room: TavernRoom) => ({
  sceneStatus: room.sceneStatus,
  characterPublicStatuses: room.characterPublicStatuses,
  characterPrivateStatuses: room.characterPrivateStatuses,
  pendingInteractions: room.pendingInteractions,
  replyOptions: room.replyOptions,
});

const projectRoomProgressFieldsToScene = (room: TavernRoom) => ({
  factEvents: room.factEvents,
  statusEvents: room.statusEvents,
  statusSnapshot: room.statusSnapshot,
  previousStatusSnapshot: room.previousStatusSnapshot,
  statusCheckpoints: room.statusCheckpoints,
  taskDefinitions: room.taskDefinitions,
  taskEvents: room.taskEvents,
  taskSnapshot: room.taskSnapshot,
  sceneOutcomes: room.sceneOutcomes,
  outcomeEvents: room.outcomeEvents,
});

const projectRoomAssetFieldsToScene = (room: TavernRoom) => ({
  illustrationHints: room.illustrationHints,
  assetDrafts: room.assetDrafts,
});

const projectRoomCharacterFieldsToScene = (room: TavernRoom) => ({
  characterConfigs: room.characterConfigs ?? {},
  characterMemories: room.characterMemories,
  characterIds: room.characterIds,
  activeCharacterId: room.activeCharacterId,
});

export const syncTavernSceneInstanceFieldsFromRoom = (
  room: TavernRoom,
  activeInstance: TavernSceneInstance,
): TavernSceneInstance => ({
  ...activeInstance,
  ...projectRoomNarrativeFieldsToScene(room),
  ...projectRoomInteractionFieldsToScene(room),
  ...projectRoomProgressFieldsToScene(room),
  ...projectRoomAssetFieldsToScene(room),
  ...projectRoomCharacterFieldsToScene(room),
  updatedAt: room.updatedAt,
});
