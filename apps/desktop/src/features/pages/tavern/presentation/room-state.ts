import {
  materializeTavernPresentationInput,
  type TavernPresentationInput,
} from "./input";
import {
  switchTavernRoomStoryNode,
} from "../runtime/active-scene-runtime";
import type {
  TavernRoom,
  TavernState,
} from "../types";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const resolvePreferredTavernRoomIds = (
  presentationInput: TavernPresentationInput,
  preferredRoomIds: string[] = [],
) => unique([
  ...preferredRoomIds,
  presentationInput.source.id ?? "",
]);

const resolveRoomSceneInstanceId = (
  room: TavernRoom,
  fallbackId?: string,
) => room.activeSceneInstanceId ?? room.sceneInstances[0]?.id ?? fallbackId;

export const materializeTavernPresentationRoomState = ({
  tavernState,
  workspaceId,
  presentationInput,
  preferredRoomIds,
  targetNodeId,
}: {
  tavernState: TavernState;
  workspaceId: string;
  presentationInput: TavernPresentationInput;
  preferredRoomIds?: string[];
  targetNodeId?: string;
}) => {
  const resolvedTargetNodeId = targetNodeId || presentationInput.route.activeNodeId;
  const roomIds = resolvePreferredTavernRoomIds(presentationInput, preferredRoomIds);
  const existingRoom = tavernState.rooms.find((room) => roomIds.includes(room.id));

  if (existingRoom) {
    const switchedRoom = switchTavernRoomStoryNode(existingRoom, resolvedTargetNodeId);
    return {
      tavernState: {
        ...tavernState,
        activeRoomId: switchedRoom.id,
        rooms: tavernState.rooms.map((room) =>
          room.id === switchedRoom.id ? switchedRoom : room
        ),
      },
      room: switchedRoom,
      sceneInstanceId: resolveRoomSceneInstanceId(switchedRoom),
    };
  }

  const materialized = materializeTavernPresentationInput(workspaceId, presentationInput);
  const switchedRoom = switchTavernRoomStoryNode(materialized.room, resolvedTargetNodeId);
  const sceneInstanceId = resolveRoomSceneInstanceId(switchedRoom, materialized.room.id);
  const messages = materialized.messages.map((message) => ({
    ...message,
    sceneId: message.sceneId ?? switchedRoom.activeSceneId,
    sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
  }));

  return {
    tavernState: {
      ...tavernState,
      activeRoomId: switchedRoom.id,
      rooms: [...tavernState.rooms, switchedRoom],
      messagesByInstance: {
        ...tavernState.messagesByInstance,
        [sceneInstanceId]: messages,
      },
      workflowTracesByInstance: {
        ...tavernState.workflowTracesByInstance,
        [sceneInstanceId]: [],
      },
    },
    room: switchedRoom,
    sceneInstanceId,
  };
};
