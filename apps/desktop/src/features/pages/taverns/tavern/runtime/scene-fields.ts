import type { TavernScene } from "@/features/pages/taverns/room/model";

export type TavernSceneFieldSource = Pick<
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
  | "characterConfigs"
  | "characterMemories"
  | "characterIds"
  | "activeCharacterId"
>;

const extractSceneNarrativeFields = (scene: TavernSceneFieldSource) => ({
  scenePresetId: scene.scenePresetId,
  scene: scene.scene,
  sceneGoal: scene.sceneGoal,
  scenePlot: scene.plot,
  sceneDirection: scene.storyDirection,
  sceneTransition: scene.transition,
  memory: scene.memory,
  relationshipOverrides: scene.relationshipOverrides,
});

const extractSceneInteractionFields = (scene: TavernSceneFieldSource) => ({
  sceneStatus: scene.sceneStatus,
  characterPublicStatuses: scene.characterPublicStatuses,
  characterPrivateStatuses: scene.characterPrivateStatuses,
  pendingInteractions: scene.pendingInteractions,
  replyOptions: scene.replyOptions,
});

const extractSceneCharacterFields = (scene: TavernSceneFieldSource) => ({
  characterConfigs: scene.characterConfigs ?? {},
  characterMemories: scene.characterMemories,
  characterIds: scene.characterIds,
  activeCharacterId: scene.activeCharacterId,
});

export const extractTavernSceneFields = (scene: TavernSceneFieldSource) => ({
  ...extractSceneNarrativeFields(scene),
  ...extractSceneInteractionFields(scene),
  ...extractSceneCharacterFields(scene),
});
