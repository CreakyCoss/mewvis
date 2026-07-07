import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { projectTavernSceneOntoRoom } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { projectTavernSceneFieldsOntoRoom } from "@/features/pages/taverns/tavern/runtime/scene-field-projection";
import { buildTavernScene, defaultSceneTitle } from "@/features/pages/taverns/tavern/story-model/scene-builder";
import { createDefaultStoryGraph } from "@/features/pages/taverns/tavern/story-model/story-graph";
import type { TavernRuntimeRoom } from ".";

export const pickTavernRoomConfig = (room: TavernRoomConfig): TavernRoomConfig => ({
  id: room.id,
  workspaceId: room.workspaceId,
  systemPresetId: room.systemPresetId,
  systemPresetVersion: room.systemPresetVersion,
  locked: room.locked,
  title: room.title,
  presentation: { ...room.presentation },
  prompt: {
    version: 1,
    blocks: room.prompt.blocks.map((block) => ({
      ...block,
      source: block.source ? { ...block.source } : undefined,
    })),
  },
  creationSource: room.creationSource,
  scenePresetId: room.scenePresetId,
  replyMode: room.replyMode,
  settings: {
    immersiveDescriptionEnabled: room.settings.immersiveDescriptionEnabled,
    directorMaxSpeakers: room.settings.directorMaxSpeakers,
    directorLoop: { ...room.settings.directorLoop },
    interactionQualityRuleIds: [...room.settings.interactionQualityRuleIds],
    directorNarrativeControl: { ...room.settings.directorNarrativeControl },
    directorScheduling: {
      ...room.settings.directorScheduling,
      speakerMotivation: {
        ...room.settings.directorScheduling.speakerMotivation,
        rules: room.settings.directorScheduling.speakerMotivation.rules.map((rule) => ({ ...rule })),
      },
      fixedOrder: {
        ...room.settings.directorScheduling.fixedOrder,
      },
    },
  },
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
});

export const createTavernRuntimeRoomFromConfig = (room: TavernRoomConfig): TavernRuntimeRoom => {
  const createdAt = typeof room.createdAt === "number" ? room.createdAt : Date.now();
  const updatedAt = typeof room.updatedAt === "number" ? room.updatedAt : createdAt;
  const scene = buildTavernScene({
    title: defaultSceneTitle,
    scenePresetId: room.scenePresetId,
    createdAt,
    updatedAt,
  });

  return projectTavernSceneOntoRoom({
    ...room,
    storyOutline: "",
    storyGoal: "",
    storyGraph: createDefaultStoryGraph([scene]),
    storyRuns: [],
    activeRunId: undefined,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    activeSceneId: scene.id,
    scenes: [scene],
    ...projectTavernSceneFieldsOntoRoom(scene),
    characterConfigs: {},
    characterMemories: {},
    localCharacters: [],
    lorebookEntries: [],
    characterIds: [],
    activeCharacterId: "",
    userPersonaName: "我",
    createdAt,
    updatedAt,
  });
};
