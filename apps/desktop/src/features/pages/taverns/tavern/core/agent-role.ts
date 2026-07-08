import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import {
  selectTavernRuntimeActiveSceneId,
  selectTavernRuntimeActiveSceneInstanceId,
} from "@/features/pages/taverns/room/runtime/accessors";

const sanitizeAgentRoleSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment || fallback;
};

const resolveTavernBridgeInstanceId = (room: TavernRoomRuntime, instanceId?: string | null) =>
  instanceId?.trim() ||
  selectTavernRuntimeActiveSceneInstanceId(room).trim() ||
  room.scenes.instances[0]?.id?.trim() ||
  selectTavernRuntimeActiveSceneId(room).trim() ||
  room.identity.id;

const tavernAgentScopeSegment = (room: TavernRoomRuntime) =>
  sanitizeAgentRoleSegment(
    selectTavernRuntimeActiveSceneInstanceId(room) ?? selectTavernRuntimeActiveSceneId(room) ?? room.identity.id,
    "instance",
  );

export const tavernBridgeSessionRootDir = (roomOrRoomId: TavernRoomRuntime | string, instanceId?: string | null) => {
  if (typeof roomOrRoomId === "string") {
    return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId, "room")}/scene-instances/${sanitizeAgentRoleSegment(
      instanceId ?? roomOrRoomId,
      "instance",
    )}/bridge`;
  }

  return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId.identity.id, "room")}/scene-instances/${sanitizeAgentRoleSegment(
    resolveTavernBridgeInstanceId(roomOrRoomId, instanceId),
    "instance",
  )}/bridge`;
};

export const tavernBridgeSessionRootDirsForRoom = (room: TavernRoomRuntime) =>
  Array.from(
    new Set([
      ...room.scenes.instances.map((instance) => tavernBridgeSessionRootDir(room, instance.id)),
      ...room.scenes.items.map(
        (scene) =>
          `tavern/${sanitizeAgentRoleSegment(room.identity.id, "room")}/scenes/${sanitizeAgentRoleSegment(
            scene.id,
            "scene",
          )}/bridge`,
      ),
      tavernBridgeSessionRootDir(room),
    ]),
  );

export const tavernDirectorAgentRoleId = (room: TavernRoomRuntime) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id, "room")}-${tavernAgentScopeSegment(room)}-director`;

export const tavernCharacterAgentRoleId = (room: TavernRoomRuntime, character: Pick<TavernCharacter, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id, "room")}-${tavernAgentScopeSegment(room)}-character-${sanitizeAgentRoleSegment(
    character.id,
    "character",
  )}`;

export const tavernQuickReplyAgentRoleId = (room: TavernRoomRuntime) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id, "room")}-${tavernAgentScopeSegment(room)}-quick-reply`;
