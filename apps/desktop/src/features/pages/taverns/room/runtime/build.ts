import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { materializeTavernPresentationInput, type TavernPresentationInput } from "../presentation-input";
import { switchTavernRoomStoryNode } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernRoomSessionState, TavernActiveRoomView } from "../model";
import { createTavernRoomRuntimeFromView } from "./selectors";

type CreateTavernRoomRuntimeInput = {
  tavernRoom: TavernRoomConfig;
  presentationInput: TavernPresentationInput;
};

const applyTavernRoomConfig = (room: TavernActiveRoomView, tavernRoom: TavernRoomConfig): TavernActiveRoomView => ({
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

const resolveRuntimeMessageSceneInstanceId = (room: TavernActiveRoomView) =>
  room.activeSceneInstanceId ?? room.sceneInstances[0]?.id ?? room.activeSceneId ?? room.id;

const materializeMessagesForRoom = (room: TavernActiveRoomView, messages: TavernMessage[]) => {
  const sceneInstanceId = resolveRuntimeMessageSceneInstanceId(room);
  return messages.map((message) => ({
    ...message,
    roomId: message.roomId || room.id,
    sceneId: message.sceneId ?? room.activeSceneId,
    sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
    status: message.status === "streaming" ? ("done" as const) : message.status,
  }));
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
    runtime: createTavernRoomRuntimeFromView(runtimeRoom),
    messages: materializeMessagesForRoom(runtimeRoom, materialized.messages),
  };
};
