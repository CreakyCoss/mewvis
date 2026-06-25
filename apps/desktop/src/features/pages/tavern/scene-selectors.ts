import type { TavernRoom } from "./types";

export const getActiveTavernStoryNode = (room: TavernRoom | null | undefined) => {
  if (!room?.storyGraph?.nodes.length) {
    return null;
  }

  return room.storyGraph.nodes.find((node) => node.id === room.storyGraph.activeNodeId) ??
    room.storyGraph.nodes.find((node) => node.id === room.storyGraph.entryNodeId) ??
    room.storyGraph.nodes[0] ??
    null;
};

export const getActiveTavernScene = (room: TavernRoom | null | undefined) => {
  if (!room?.scenes?.length) {
    return null;
  }

  const activeNode = getActiveTavernStoryNode(room);
  if (activeNode?.sceneId) {
    const nodeScene = room.scenes.find((scene) => scene.id === activeNode.sceneId);
    if (nodeScene) {
      return nodeScene;
    }
  }

  return room.scenes.find((scene) => scene.id === room.activeSceneId) ?? room.scenes[0] ?? null;
};

export const getTavernSceneDisplayTitle = (
  room: Pick<TavernRoom, "storyGraph" | "scenes"> | null | undefined,
  sceneId: string | undefined,
  fallback = "默认场景",
) => {
  if (!sceneId) {
    return fallback;
  }

  const boundNodeTitle = room?.storyGraph?.nodes
    .find((node) => node.sceneId === sceneId)
    ?.title
    ?.trim();
  if (boundNodeTitle) {
    return boundNodeTitle;
  }

  return room?.scenes?.find((scene) => scene.id === sceneId)?.title?.trim() || fallback;
};

export const getTavernSceneInstanceDisplayTitle = (
  room: Pick<TavernRoom, "storyGraph" | "scenes" | "sceneInstances"> | null | undefined,
  sceneInstanceId: string | undefined,
  fallback = "当前节点",
) => {
  if (!room) {
    return fallback;
  }

  const instance = room?.sceneInstances?.find((item) => item.id === sceneInstanceId);
  if (!instance) {
    return fallback;
  }

  const nodeById = new Map(room.storyGraph.nodes.map((node) => [node.id, node]));
  const currentNodeTitle = nodeById.get(instance.nodeId)?.title.trim() ||
    getTavernSceneDisplayTitle(room, instance.sceneId, fallback);
  const pathTitles = instance.pathNodeIds
    .map((nodeId) => {
      const node = nodeById.get(nodeId);
      return node?.title.trim() ||
        getTavernSceneDisplayTitle(room, node?.sceneId, "");
    })
    .filter((title): title is string => Boolean(title));

  if (pathTitles.length > 1) {
    return `${currentNodeTitle} · ${pathTitles.join(" / ")}`;
  }

  return currentNodeTitle;
};
