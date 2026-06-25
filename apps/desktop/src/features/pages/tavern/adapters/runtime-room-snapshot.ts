import {
  projectTavernSceneOntoRoom,
} from "../active-scene-runtime";
import type {
  TavernMessage,
  TavernRoom,
  TavernState,
} from "../types";

const TAVERN_RUNTIME_ROOM_SNAPSHOT_SCHEMA = "novel-claw.tavern-runtime-room";

export type TavernRuntimeRoomSnapshot = {
  schema: typeof TAVERN_RUNTIME_ROOM_SNAPSHOT_SCHEMA;
  version: 1;
  exportedAt: string;
  room: TavernRoom;
  messagesByInstance: Record<string, TavernMessage[]>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const createTavernRuntimeRoomSnapshot = ({
  room,
  messagesByInstance,
  exportedAt = new Date().toISOString(),
}: {
  room: TavernRoom;
  messagesByInstance: TavernState["messagesByInstance"];
  exportedAt?: string;
}): TavernRuntimeRoomSnapshot => {
  const projectedRoom = projectTavernSceneOntoRoom(room);

  return {
    schema: TAVERN_RUNTIME_ROOM_SNAPSHOT_SCHEMA,
    version: 1,
    exportedAt,
    room: projectedRoom,
    messagesByInstance: Object.fromEntries(
      projectedRoom.sceneInstances.map((instance) => [
        instance.id,
        messagesByInstance[instance.id] ?? [],
      ]),
    ),
  };
};

export const parseTavernRuntimeRoomSnapshot = (
  value: unknown,
): TavernRuntimeRoomSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.schema !== TAVERN_RUNTIME_ROOM_SNAPSHOT_SCHEMA ||
    value.version !== 1 ||
    !isRecord(value.room) ||
    !isRecord(value.messagesByInstance)
  ) {
    return null;
  }

  return value as TavernRuntimeRoomSnapshot;
};

export const materializeTavernRuntimeRoomSnapshot = ({
  snapshot,
  workspaceId,
  timestamp = Date.now(),
}: {
  snapshot: TavernRuntimeRoomSnapshot;
  workspaceId: string;
  timestamp?: number;
}) => {
  const room = projectTavernSceneOntoRoom({
    ...snapshot.room,
    workspaceId,
    locked: false,
    creationSource: "imported",
    updatedAt: timestamp,
  });
  const messagesByInstance = Object.fromEntries(
    room.sceneInstances.map((instance) => [
      instance.id,
      (snapshot.messagesByInstance[instance.id] ?? []).map((message) => ({
        ...message,
        roomId: room.id,
        sceneId: message.sceneId ?? instance.sceneId,
        sceneInstanceId: message.sceneInstanceId ?? instance.id,
      })),
    ]),
  );

  return {
    room,
    messagesByInstance,
  };
};
