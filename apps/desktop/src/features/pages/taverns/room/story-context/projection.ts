import type { TavernCharacter, TavernLorebookEntry, TavernSceneStatus } from "@/features/pages/taverns/manage/model";
import type {
  TavernActiveRoomView as TavernRoom,
  TavernScene,
  TavernSceneInstance,
  TavernStoryGraph,
} from "@/features/pages/taverns/room/model";

export type TavernRuntimeStorySceneProjection = {
  id: string;
  title: string;
  scene: string;
  goal: string;
  plot: string;
  direction: string;
  transition: string;
  memory: string;
  status?: TavernSceneStatus;
};

export type TavernRuntimeStoryProjection = {
  story: {
    id: string;
    title: string;
    outline: string;
    goal: string;
    userPersonaName: string;
  };
  graph: TavernStoryGraph;
  scenes: TavernScene[];
  activeScene: TavernRuntimeStorySceneProjection;
  activeSceneInstance: TavernSceneInstance | null;
  branch: {
    pathNodeIds: string[];
    pathEdgeIds: string[];
  };
  characters: TavernCharacter[];
  lorebookEntries: TavernLorebookEntry[];
  activeCharacterId: string;
};

const getTavernActiveSceneInstance = (room: TavernRoom) =>
  room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ?? room.sceneInstances[0] ?? null;

export const getTavernRuntimeStoryProjection = (
  room: TavernRoom,
  characters = room.localCharacters ?? [],
): TavernRuntimeStoryProjection => {
  const activeSceneInstance = getTavernActiveSceneInstance(room);

  return {
    story: {
      id: room.storyBinding?.storyId ?? room.id,
      title: room.title,
      outline: room.storyOutline,
      goal: room.storyGoal,
      userPersonaName: room.userPersonaName,
    },
    graph: room.storyGraph,
    scenes: room.scenes ?? [],
    activeScene: {
      id: room.activeSceneId ?? activeSceneInstance?.sceneId ?? activeSceneInstance?.id ?? room.id,
      title: activeSceneInstance?.title?.trim() || room.title,
      scene: room.scene,
      goal: room.sceneGoal,
      plot: room.scenePlot,
      direction: room.sceneDirection,
      transition: room.sceneTransition,
      memory: room.memory,
      status: room.sceneStatus,
    },
    activeSceneInstance,
    branch: {
      pathNodeIds: activeSceneInstance?.pathNodeIds ?? [],
      pathEdgeIds: activeSceneInstance?.pathEdgeIds ?? [],
    },
    characters,
    lorebookEntries: room.lorebookEntries,
    activeCharacterId: room.activeCharacterId,
  };
};
