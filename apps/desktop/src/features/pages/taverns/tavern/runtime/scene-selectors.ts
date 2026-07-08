import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import {
  selectTavernRuntimeActiveNode,
  selectTavernRuntimeActiveScene,
} from "@/features/pages/taverns/room/runtime/accessors";

export const getActiveTavernScene = (room: TavernRoomRuntime | null | undefined) =>
  room ? selectTavernRuntimeActiveScene(room) : null;

export const getTavernSceneDisplayTitle = (
  room: TavernRoomRuntime | null | undefined,
  sceneId: string | undefined,
  fallback = "默认场景",
) => {
  if (!sceneId) {
    return fallback;
  }

  const boundNodeTitle = room?.story.graph.nodes.find((node) => node.sceneId === sceneId)?.title?.trim();
  if (boundNodeTitle) {
    return boundNodeTitle;
  }

  return room?.scenes.items.find((scene) => scene.id === sceneId)?.title?.trim() || fallback;
};

export const getTavernSceneInstanceDisplayTitle = (
  room: TavernRoomRuntime | null | undefined,
  sceneInstanceId: string | undefined,
  fallback = "当前节点",
) => {
  if (!room) {
    return fallback;
  }

  const instance = room.scenes.instances.find((item) => item.id === sceneInstanceId);
  if (!instance) {
    return fallback;
  }

  const activeNode = selectTavernRuntimeActiveNode(room);
  const nodeById = new Map(room.story.graph.nodes.map((node) => [node.id, node]));
  const currentNodeTitle =
    nodeById.get(instance.nodeId)?.title.trim() ||
    activeNode?.title.trim() ||
    getTavernSceneDisplayTitle(room, instance.sceneId, fallback);
  const pathTitles = instance.pathNodeIds
    .map((nodeId) => {
      const node = nodeById.get(nodeId);
      return node?.title.trim() || getTavernSceneDisplayTitle(room, node?.sceneId, "");
    })
    .filter((title): title is string => Boolean(title));

  if (pathTitles.length > 1) {
    return `${currentNodeTitle} · ${pathTitles.join(" / ")}`;
  }

  return currentNodeTitle;
};
