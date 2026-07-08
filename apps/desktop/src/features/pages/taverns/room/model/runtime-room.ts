import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { projectTavernSceneOntoRoom } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { projectTavernSceneFieldsOntoRoom } from "@/features/pages/taverns/tavern/runtime/scene-field-projection";
import { buildTavernScene, defaultSceneTitle } from "@/features/pages/taverns/room/story-model/scene-builder";
import { createDefaultStoryGraph } from "@/features/pages/taverns/room/story-model/story-graph";
import type { TavernActiveRoomView } from ".";

export const createTavernActiveRoomViewFromConfig = (room: TavernRoomConfig): TavernActiveRoomView => {
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
