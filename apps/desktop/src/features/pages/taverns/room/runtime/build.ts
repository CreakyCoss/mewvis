import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { materializeTavernPresentationInput, type TavernPresentationInput } from "../presentation-input";
import { switchTavernRoomStoryNode } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernRoomRuntime, TavernRoomSessionState, TavernRuntimeRoom } from "../model";
import { createTavernRoomRuntimeFromRoom } from "./selectors";

export type CreateTavernRoomRuntimeInput = {
  tavernRoom: TavernRoomConfig;
  presentationInput: TavernPresentationInput;
};

const applyTavernRoomConfig = (room: TavernRuntimeRoom, tavernRoom: TavernRoomConfig): TavernRuntimeRoom => ({
  ...room,
  id: tavernRoom.id,
  workspaceId: tavernRoom.workspaceId,
  title: tavernRoom.title,
  systemPresetId: tavernRoom.systemPresetId,
  systemPresetVersion: tavernRoom.systemPresetVersion,
  presentation: tavernRoom.presentation,
  prompt: tavernRoom.prompt,
  scenePresetId: tavernRoom.scenePresetId,
  replyMode: tavernRoom.replyMode,
  settings: tavernRoom.settings,
  creationSource: tavernRoom.creationSource,
  createdAt: tavernRoom.createdAt,
});

const resolveRuntimeMessageSceneInstanceId = (room: TavernRuntimeRoom) =>
  room.activeSceneInstanceId ?? room.sceneInstances[0]?.id ?? room.activeSceneId ?? room.id;

const materializeMessagesForRoom = (room: TavernRuntimeRoom, messages: TavernMessage[]) => {
  const sceneInstanceId = resolveRuntimeMessageSceneInstanceId(room);
  return messages.map((message) => ({
    ...message,
    roomId: message.roomId || room.id,
    sceneId: message.sceneId ?? room.activeSceneId,
    sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
    status: message.status === "streaming" ? ("done" as const) : message.status,
  }));
};

export const createTavernRoomRuntime = ({
  tavernRoom,
  presentationInput,
}: CreateTavernRoomRuntimeInput): TavernRoomRuntime => {
  const materialized = materializeTavernPresentationInput(tavernRoom.workspaceId, presentationInput, {
    roomId: tavernRoom.id,
  });
  const runtimeRoom = switchTavernRoomStoryNode(
    applyTavernRoomConfig(materialized.room, tavernRoom),
    presentationInput.route.activeNodeId,
  );
  return createTavernRoomRuntimeFromRoom(runtimeRoom);
};

export const createTavernRoomRuntimeSessionState = ({
  tavernRoom,
  presentationInput,
}: CreateTavernRoomRuntimeInput): TavernRoomSessionState => {
  const materialized = materializeTavernPresentationInput(tavernRoom.workspaceId, presentationInput, {
    roomId: tavernRoom.id,
  });
  const runtimeRoom = switchTavernRoomStoryNode(
    applyTavernRoomConfig(materialized.room, tavernRoom),
    presentationInput.route.activeNodeId,
  );

  return {
    runtime: createTavernRoomRuntimeFromRoom(runtimeRoom),
    messages: materializeMessagesForRoom(runtimeRoom, materialized.messages),
  };
};
