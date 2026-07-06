import { createEmptyCharacterMemoryLayers, createEmptySceneMemoryLayers } from "./memory-layers";
import { ensureTavernRoomRuntimeScopes } from "./room-runtime-scopes";
import { normalizeScenePromptOverrides } from "./scene-prompt-overrides";
import { projectTavernSceneFieldsOntoRoom, syncTavernSceneInstanceFieldsFromRoom } from "./scene-field-projection";
import { resolveActiveSceneInstance } from "./scene-instances";
import { createRouteScopedSceneInstanceId, resolveRunNodePrefix } from "./story-runtime";
import type {
  TavernCharacterMemoryLayers,
  TavernRoom,
  TavernSceneMemoryLayers,
  TavernScenePromptOverrides,
} from "@/features/pages/taverns/manage/model";

export const getActiveTavernSceneInstance = (room: TavernRoom | null | undefined) => {
  if (!room?.sceneInstances?.length) {
    return null;
  }

  return resolveActiveSceneInstance(room);
};

export const findTavernSceneInstanceIdForNode = (room: TavernRoom, nodeId: string | undefined | null) => {
  const targetNodeId = nodeId?.trim();
  if (!targetNodeId) {
    return "";
  }

  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeRun =
    runtimeRoom.storyRuns.find((run) => run.id === runtimeRoom.activeRunId && run.pathNodeIds.includes(targetNodeId)) ??
    runtimeRoom.storyRuns.find((run) => run.pathNodeIds.includes(targetNodeId)) ??
    null;
  const scopedInstanceId = activeRun
    ? createRouteScopedSceneInstanceId(runtimeRoom.id, resolveRunNodePrefix(activeRun, targetNodeId))
    : "";

  return (
    runtimeRoom.sceneInstances.find((instance) => instance.id === scopedInstanceId)?.id ??
    runtimeRoom.sceneInstances.find((instance) => instance.nodeId === targetNodeId)?.id ??
    ""
  );
};

export const switchTavernRoomStoryNode = (room: TavernRoom, nodeId: string | undefined | null) => {
  const sceneInstanceId = findTavernSceneInstanceIdForNode(room, nodeId);
  return sceneInstanceId ? switchTavernRoomSceneInstance(room, sceneInstanceId) : room;
};

export const projectTavernSceneOntoRoom = (room: TavernRoom): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  return {
    ...runtimeRoom,
    activeSceneId: activeInstance.sceneId,
    activeSceneInstanceId: activeInstance.id,
    ...projectTavernSceneFieldsOntoRoom(activeInstance),
  };
};

export const updateTavernActiveSceneMemoryLayers = (room: TavernRoom, patch: Partial<TavernSceneMemoryLayers>) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    return {
      ...instance,
      memoryLayers: {
        ...createEmptySceneMemoryLayers(instance.memoryLayers),
        ...patch,
        updatedAt,
      },
      updatedAt,
    };
  });

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const updateTavernActiveCharacterMemoryLayers = (
  room: TavernRoom,
  characterId: string,
  patch: Partial<TavernCharacterMemoryLayers>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance || !characterId) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    const characterMemoryLayers = { ...instance.characterMemoryLayers };
    characterMemoryLayers[characterId] = {
      ...createEmptyCharacterMemoryLayers(characterMemoryLayers[characterId]),
      ...patch,
      updatedAt,
    };

    return {
      ...instance,
      characterMemoryLayers,
      updatedAt,
    };
  });

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const updateTavernActiveScenePromptOverrides = (
  room: TavernRoom,
  overrides: Partial<TavernScenePromptOverrides>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) =>
    instance.id === activeInstance.id
      ? {
          ...instance,
          promptOverrides: normalizeScenePromptOverrides(overrides),
          updatedAt,
        }
      : instance,
  );

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const syncTavernRoomActiveScene = (room: TavernRoom): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const syncedInstance = syncTavernSceneInstanceFieldsFromRoom(room, activeInstance);

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeSceneId: syncedInstance.sceneId,
    activeSceneInstanceId: syncedInstance.id,
    sceneInstances: runtimeRoom.sceneInstances.map((instance) =>
      instance.id === syncedInstance.id ? syncedInstance : instance,
    ),
  });
};

export const switchTavernRoomScene = (room: TavernRoom, sceneId: string): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const scene = runtimeRoom.scenes?.find((item) => item.id === sceneId);
  const node = runtimeRoom.storyGraph?.nodes.find((item) => item.sceneId === sceneId);
  const activeRun = node
    ? (runtimeRoom.storyRuns.find((run) => run.id === runtimeRoom.activeRunId && run.pathNodeIds.includes(node.id)) ??
      runtimeRoom.storyRuns.find((run) => run.pathNodeIds.includes(node.id)) ??
      null)
    : null;
  const activeInstanceId =
    activeRun && node
      ? createRouteScopedSceneInstanceId(runtimeRoom.id, resolveRunNodePrefix(activeRun, node.id))
      : undefined;
  return scene
    ? projectTavernSceneOntoRoom({
        ...runtimeRoom,
        storyGraph: node
          ? {
              ...runtimeRoom.storyGraph,
              activeNodeId: node.id,
            }
          : runtimeRoom.storyGraph,
        storyRuns: activeRun
          ? runtimeRoom.storyRuns.map((run) =>
              run.id === activeRun.id ? { ...run, activeNodeId: node?.id ?? run.activeNodeId } : run,
            )
          : runtimeRoom.storyRuns,
        activeRunId: activeRun?.id ?? runtimeRoom.activeRunId,
        activeSceneId: scene.id,
        activeSceneInstanceId: activeInstanceId ?? runtimeRoom.activeSceneInstanceId,
        updatedAt: Date.now(),
      })
    : runtimeRoom;
};

export const switchTavernRoomSceneInstance = (room: TavernRoom, sceneInstanceId: string): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = runtimeRoom.sceneInstances.find((instance) => instance.id === sceneInstanceId);
  if (!activeInstance) {
    return switchTavernRoomScene(runtimeRoom, sceneInstanceId);
  }

  const activeRunId = activeInstance.runIds.includes(runtimeRoom.activeRunId ?? "")
    ? runtimeRoom.activeRunId
    : (activeInstance.runIds[0] ?? runtimeRoom.activeRunId);

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeRunId,
    activeSceneId: activeInstance.sceneId,
    activeSceneInstanceId: activeInstance.id,
    storyGraph: {
      ...runtimeRoom.storyGraph,
      activeNodeId: activeInstance.nodeId,
    },
    storyRuns: runtimeRoom.storyRuns.map((run) =>
      run.id === activeRunId ? { ...run, activeNodeId: activeInstance.nodeId, updatedAt: Date.now() } : run,
    ),
    updatedAt: Date.now(),
  });
};
