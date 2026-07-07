import type { TavernRuntimeRoom } from "@/features/pages/taverns/room/model";
import { pickTavernRoomConfig } from "@/features/pages/taverns/room/model/runtime-room";
import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { materializeTavernPresentationInput, type TavernPresentationInput } from "./input";
import { switchTavernRoomStoryNode } from "../runtime/active-scene-runtime";
import type { TavernState } from "../types";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const resolvePreferredTavernRoomIds = (presentationInput: TavernPresentationInput, preferredRoomIds: string[] = []) =>
  unique([...preferredRoomIds, presentationInput.source.id ?? ""]);

const resolveRoomSceneInstanceId = (room: TavernRuntimeRoom, fallbackId?: string) =>
  room.activeSceneInstanceId ?? room.sceneInstances[0]?.id ?? fallbackId;

const applyCarrierRoomConfig = (
  room: TavernRuntimeRoom,
  carrierRoom: TavernRoomConfig | undefined,
): TavernRuntimeRoom => {
  if (!carrierRoom) {
    return room;
  }

  return {
    ...room,
    title: carrierRoom.title,
    systemPresetId: carrierRoom.systemPresetId,
    systemPresetVersion: carrierRoom.systemPresetVersion,
    presentation: carrierRoom.presentation,
    prompt: carrierRoom.prompt,
    scenePresetId: carrierRoom.scenePresetId,
    replyMode: carrierRoom.replyMode,
    settings: carrierRoom.settings,
    creationSource: carrierRoom.creationSource,
  };
};

const upsertTavernRoomConfig = (state: TavernState, room: TavernRuntimeRoom): TavernState => {
  const roomConfig = pickTavernRoomConfig(room);
  const rooms = state.rooms.some((item) => item.id === roomConfig.id)
    ? state.rooms.map((item) => (item.id === roomConfig.id ? roomConfig : item))
    : [...state.rooms, roomConfig];

  return {
    ...state,
    activeRoomId: roomConfig.id,
    rooms,
  };
};

export const materializeTavernPresentationRoomState = ({
  tavernState,
  workspaceId,
  presentationInput,
  preferredRoomIds,
  targetNodeId,
  roomId,
  carrierRoom,
}: {
  tavernState: TavernState;
  workspaceId: string;
  presentationInput: TavernPresentationInput;
  preferredRoomIds?: string[];
  targetNodeId?: string;
  roomId?: string;
  carrierRoom?: TavernRoomConfig;
}) => {
  const resolvedTargetNodeId = targetNodeId || presentationInput.route.activeNodeId;
  const roomIds = resolvePreferredTavernRoomIds(presentationInput, preferredRoomIds);
  const existingRoom = tavernState.rooms.find((room) => roomIds.includes(room.id));

  const materialized = materializeTavernPresentationInput(workspaceId, presentationInput, {
    roomId: existingRoom?.id ?? roomId,
  });
  const switchedRoom = switchTavernRoomStoryNode(
    applyCarrierRoomConfig(materialized.room, existingRoom ?? carrierRoom),
    resolvedTargetNodeId,
  );
  const sceneInstanceId = resolveRoomSceneInstanceId(switchedRoom, materialized.room.id);
  const messages = materialized.messages.map((message) => ({
    ...message,
    sceneId: message.sceneId ?? switchedRoom.activeSceneId,
    sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
  }));
  return {
    tavernState: upsertTavernRoomConfig(tavernState, switchedRoom),
    room: switchedRoom,
    sceneInstanceId,
    messages,
  };
};
