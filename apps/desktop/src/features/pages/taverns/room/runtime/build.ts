import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { materializeTavernPresentationInput } from "../presentation-input/materialize";
import type { TavernPresentationInput } from "../presentation-input/types";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernRoomRuntime, TavernRoomSessionState } from "../model";
import { selectTavernRuntimeActiveSceneId, selectTavernRuntimeActiveSceneInstanceId } from "./accessors";
import { switchTavernRuntimeScene } from "./mutations";

type CreateTavernRoomRuntimeInput = {
  tavernRoom: TavernRoomConfig;
  presentationInput: TavernPresentationInput;
};

const applyTavernRoomConfig = (runtime: TavernRoomRuntime, tavernRoom: TavernRoomConfig): TavernRoomRuntime => ({
  ...runtime,
  identity: {
    ...runtime.identity,
    id: tavernRoom.id,
    workspaceId: tavernRoom.workspaceId,
    title: tavernRoom.title,
    systemPresetId: tavernRoom.systemPresetId,
    systemPresetVersion: tavernRoom.systemPresetVersion,
    creationSource: tavernRoom.creationSource,
    createdAt: tavernRoom.createdAt,
  },
  config: {
    room: {
      ...tavernRoom,
      updatedAt: runtime.identity.updatedAt,
    },
  },
  presentation: {
    ...runtime.presentation,
    profile: tavernRoom.presentation,
    prompt: tavernRoom.prompt,
    scenePresetId: tavernRoom.scenePresetId,
    replyMode: tavernRoom.replyMode,
    settings: tavernRoom.settings,
  },
});

const resolveRuntimeMessageSceneInstanceId = (room: TavernRoomRuntime) =>
  selectTavernRuntimeActiveSceneInstanceId(room) ?? selectTavernRuntimeActiveSceneId(room) ?? room.identity.id;

const materializeMessagesForRoom = (room: TavernRoomRuntime, messages: TavernMessage[]) => {
  const sceneInstanceId = resolveRuntimeMessageSceneInstanceId(room);
  const sceneId = selectTavernRuntimeActiveSceneId(room);
  return messages.map((message) => ({
    ...message,
    roomId: message.roomId || room.identity.id,
    sceneId: message.sceneId ?? sceneId,
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
  const runtimeRoom = switchTavernRuntimeScene(
    applyTavernRoomConfig(materialized.room, tavernRoom),
    presentationInput.route.activeNodeId,
  );

  return {
    runtime: runtimeRoom,
    messages: materializeMessagesForRoom(runtimeRoom, materialized.messages),
  };
};
