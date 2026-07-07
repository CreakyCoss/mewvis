import { createRouteScopedSceneInstanceId } from "./story-runtime";
import type {
  TavernRuntimeRoom as TavernRoom,
  TavernSceneInstance,
} from "@/features/pages/taverns/room/model";

export const collectUniqueTrimmedLines = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      return [];
    }

    seen.add(trimmed);
    return [trimmed];
  });
};

export const getTavernBranchPathInstances = (room: TavernRoom, activeInstance: TavernSceneInstance) => {
  const previousPathNodePrefixes = activeInstance.pathNodeIds
    .slice(0, -1)
    .map((_, index) => activeInstance.pathNodeIds.slice(0, index + 1));
  const previousInstances = previousPathNodePrefixes.flatMap((pathNodeIds) => {
    const instanceId = createRouteScopedSceneInstanceId(room.id, pathNodeIds);
    const instance =
      room.sceneInstances.find((item) => item.id === instanceId) ??
      room.sceneInstances.find(
        (item) =>
          item.pathNodeIds.length === pathNodeIds.length &&
          item.pathNodeIds.every((nodeId, index) => nodeId === pathNodeIds[index]),
      );
    return instance ? [instance] : [];
  });

  return { pathInstances: [...previousInstances, activeInstance] };
};
