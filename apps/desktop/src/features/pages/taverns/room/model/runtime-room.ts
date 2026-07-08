import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { buildTavernScene, defaultSceneTitle } from "@/features/pages/taverns/room/story-model/scene-builder";
import { createDefaultStoryGraph } from "@/features/pages/taverns/room/story-model/story-graph";
import type { TavernRoomRuntime } from ".";

export const createTavernRoomRuntimeFromConfig = (room: TavernRoomConfig): TavernRoomRuntime => {
  const createdAt = typeof room.createdAt === "number" ? room.createdAt : Date.now();
  const updatedAt = typeof room.updatedAt === "number" ? room.updatedAt : createdAt;
  const scene = buildTavernScene({
    title: defaultSceneTitle,
    scenePresetId: room.scenePresetId,
    createdAt,
    updatedAt,
  });
  const storyGraph = createDefaultStoryGraph([scene]);

  return {
    version: 1,
    identity: {
      id: room.id,
      workspaceId: room.workspaceId,
      title: room.title,
      systemPresetId: room.systemPresetId,
      systemPresetVersion: room.systemPresetVersion,
      creationSource: room.creationSource,
      createdAt,
      updatedAt,
    },
    config: {
      room: {
        ...room,
        createdAt,
        updatedAt,
      },
    },
    presentation: {
      profile: room.presentation,
      prompt: room.prompt,
      settings: room.settings,
      scenePresetId: room.scenePresetId,
      replyMode: room.replyMode,
    },
    story: {
      outline: "",
      goal: "",
      graph: storyGraph,
      activeNodeId: storyGraph.activeNodeId,
    },
    cast: {
      characters: [],
      characterIds: [],
      activeCharacterId: "",
      characterConfigs: {},
      characterMemories: {},
    },
    scenes: {
      items: [scene],
      activeSceneId: scene.id,
      instances: [],
      activeSceneInstanceId: undefined,
    },
    world: {
      lorebookEntries: [],
    },
    user: {
      personaName: "我",
    },
  };
};
