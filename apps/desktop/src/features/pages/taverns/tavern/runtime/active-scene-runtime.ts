import { createEmptyCharacterMemoryLayers, createEmptySceneMemoryLayers } from "./memory-layers";
import { ensureTavernRoomRuntimeScopes } from "./room-runtime-scopes";
import { normalizeScenePromptOverrides } from "./scene-prompt-overrides";
import { projectTavernSceneFieldsOntoRoom, syncTavernSceneInstanceFieldsFromRoom } from "./scene-field-projection";
import { resolveActiveSceneInstance } from "./scene-instances";
import type {
  TavernCharacterMemoryLayers,
  TavernActiveRoomView as TavernRoom,
  TavernSceneMemoryLayers,
} from "@/features/pages/taverns/room/model";
import type { TavernScenePromptOverrides } from "@/features/pages/taverns/manage/model";

const getActiveTavernSceneInstance = (room: TavernRoom | null | undefined) => {
  if (!room?.sceneInstances?.length) {
    return null;
  }

  return resolveActiveSceneInstance(room);
};

const findTavernSceneInstanceIdForNode = (room: TavernRoom, nodeId: string | undefined | null) => {
  const targetNodeId = nodeId?.trim();
  if (!targetNodeId) {
    return "";
  }

  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  return runtimeRoom.sceneInstances.find((instance) => instance.nodeId === targetNodeId)?.id ?? "";
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
    storyGraph: {
      ...runtimeRoom.storyGraph,
      activeNodeId: activeInstance.nodeId,
    },
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
  const node =
    runtimeRoom.storyGraph.nodes.find((item) => item.sceneId === sceneId) ??
    runtimeRoom.storyGraph.nodes.find((item) => item.id === sceneId);
  const activeInstance =
    (node ? runtimeRoom.sceneInstances.find((instance) => instance.nodeId === node.id) : undefined) ??
    runtimeRoom.sceneInstances.find((instance) => instance.sceneId === sceneId);

  if (!scene && !activeInstance) {
    return runtimeRoom;
  }

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeSceneId: activeInstance?.sceneId ?? scene?.id ?? runtimeRoom.activeSceneId,
    activeSceneInstanceId: activeInstance?.id ?? runtimeRoom.activeSceneInstanceId,
    storyGraph: {
      ...runtimeRoom.storyGraph,
      activeNodeId: activeInstance?.nodeId ?? node?.id ?? runtimeRoom.storyGraph.activeNodeId,
    },
    updatedAt: Date.now(),
  });
};

export const switchTavernRoomSceneInstance = (room: TavernRoom, sceneInstanceId: string): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = runtimeRoom.sceneInstances.find((instance) => instance.id === sceneInstanceId);
  if (!activeInstance) {
    return switchTavernRoomScene(runtimeRoom, sceneInstanceId);
  }

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeSceneId: activeInstance.sceneId,
    activeSceneInstanceId: activeInstance.id,
    storyGraph: {
      ...runtimeRoom.storyGraph,
      activeNodeId: activeInstance.nodeId,
    },
    updatedAt: Date.now(),
  });
};
