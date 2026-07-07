import { buildNodeScopedSceneInstances } from "./scene-instances";
import { createDefaultStoryGraph, normalizeStoryGraph } from "../story-model/story-graph";
import { now } from "../ids";
import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";

export const ensureTavernRoomRuntimeScopes = (room: TavernRoom): TavernRoom => {
  if (!room.scenes?.length) {
    throw new Error("酒馆房间缺少标准故事场景，无法初始化运行时。");
  }

  const scenes = room.scenes;
  const graph = room.storyGraph?.nodes?.length
    ? normalizeStoryGraph(room.storyGraph, scenes)
    : createDefaultStoryGraph(scenes);
  const createdAt = typeof room.createdAt === "number" ? room.createdAt : now();
  const sceneInstances = buildNodeScopedSceneInstances({
    roomId: room.id,
    graph,
    scenes,
    existingInstances: room.sceneInstances ?? [],
  });
  const activeInstance =
    sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ??
    sceneInstances.find((instance) => instance.nodeId === graph.activeNodeId) ??
    sceneInstances.find((instance) => instance.sceneId === room.activeSceneId) ??
    sceneInstances[0] ??
    null;
  const activeNodeId = activeInstance?.nodeId ?? graph.activeNodeId;

  return {
    ...room,
    storyGraph: { ...graph, activeNodeId },
    activeSceneInstanceId: activeInstance?.id,
    activeSceneId: activeInstance?.sceneId ?? room.activeSceneId,
    scenes,
    sceneInstances,
    createdAt,
  };
};
