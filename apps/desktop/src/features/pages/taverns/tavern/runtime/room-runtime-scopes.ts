import { buildSceneInstancesForRuns } from "./scene-instances";
import { createDefaultStoryGraph, normalizeStoryGraph } from "../story-model/story-graph";
import {
  buildStoryRunsFromGraph,
  createRouteScopedSceneInstanceId,
  resolveActiveRun,
  resolveRunNodePrefix,
} from "./story-runtime";
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
  const storyRuns = room.storyRuns?.length
    ? room.storyRuns
        .map((run) => {
          const pathNodeIds = run.pathNodeIds.filter((nodeId) => graph.nodes.some((node) => node.id === nodeId));
          const pathEdgeIds = run.pathEdgeIds.filter((edgeId) => graph.edges.some((edge) => edge.id === edgeId));

          return {
            ...run,
            pathNodeIds,
            pathEdgeIds,
            activeNodeId: pathNodeIds.includes(run.activeNodeId)
              ? run.activeNodeId
              : (pathNodeIds[0] ?? graph.activeNodeId),
          };
        })
        .filter((run) => run.pathNodeIds.length > 0)
    : buildStoryRunsFromGraph(graph, createdAt);
  const normalizedRuns = storyRuns.length > 0 ? storyRuns : buildStoryRunsFromGraph(graph, createdAt);
  const activeRun = resolveActiveRun(normalizedRuns, room.activeRunId);
  const activeNodeId = activeRun?.pathNodeIds.includes(graph.activeNodeId)
    ? graph.activeNodeId
    : (activeRun?.activeNodeId ?? activeRun?.pathNodeIds[0] ?? graph.activeNodeId);
  const syncedRuns = normalizedRuns.map((run) =>
    activeRun && run.id === activeRun.id ? { ...run, activeNodeId, updatedAt: room.updatedAt } : run,
  );
  const sceneInstances = buildSceneInstancesForRuns({
    roomId: room.id,
    graph: { ...graph, activeNodeId },
    scenes,
    runs: syncedRuns,
    existingInstances: room.sceneInstances,
  });
  const scopedInstanceId = activeRun
    ? createRouteScopedSceneInstanceId(room.id, resolveRunNodePrefix(activeRun, activeNodeId))
    : "";
  const activeInstance =
    sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ??
    sceneInstances.find((instance) => instance.id === scopedInstanceId) ??
    sceneInstances[0] ??
    null;

  return {
    ...room,
    storyGraph: { ...graph, activeNodeId },
    storyRuns: syncedRuns,
    activeRunId: activeRun?.id,
    activeSceneInstanceId: activeInstance?.id,
    activeSceneId: activeInstance?.sceneId ?? room.activeSceneId,
    scenes,
    sceneInstances,
  };
};
