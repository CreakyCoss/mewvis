import type { TavernCharacter, TavernRoom } from "../types";

type TavernBridgeSessionScope = Pick<
  TavernRoom,
  "id" | "activeSceneId" | "activeSceneInstanceId" | "scenes" | "sceneInstances"
>;

const sanitizeAgentRoleSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment || fallback;
};

const resolveTavernBridgeInstanceId = (
  room: TavernBridgeSessionScope,
  instanceId?: string | null,
) =>
  instanceId?.trim() ||
  room.activeSceneInstanceId?.trim() ||
  room.sceneInstances?.[0]?.id?.trim() ||
  room.activeSceneId?.trim() ||
  room.id;

const tavernAgentScopeSegment = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
) => sanitizeAgentRoleSegment(
  room.activeSceneInstanceId ?? room.activeSceneId ?? room.id,
  "instance",
);

export const tavernLegacyBridgeSessionRootDir = (roomId: string) =>
  `tavern/${sanitizeAgentRoleSegment(roomId, "room")}/bridge`;

export const tavernBridgeSessionRootDir = (
  roomOrRoomId: TavernBridgeSessionScope | string,
  instanceId?: string | null,
) => {
  if (typeof roomOrRoomId === "string") {
    return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId, "room")}/scene-instances/${
      sanitizeAgentRoleSegment(instanceId ?? roomOrRoomId, "instance")
    }/bridge`;
  }

  return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId.id, "room")}/scene-instances/${
    sanitizeAgentRoleSegment(resolveTavernBridgeInstanceId(roomOrRoomId, instanceId), "instance")
  }/bridge`;
};

export const tavernBridgeSessionRootDirsForRoom = (
  room: TavernBridgeSessionScope,
) => Array.from(new Set([
  ...(room.sceneInstances?.map((instance) => tavernBridgeSessionRootDir(room, instance.id)) ?? []),
  ...(room.scenes?.map((scene) =>
    `tavern/${sanitizeAgentRoleSegment(room.id, "room")}/scenes/${
      sanitizeAgentRoleSegment(scene.id, "scene")
    }/bridge`
  ) ?? []),
  tavernBridgeSessionRootDir(room),
  tavernLegacyBridgeSessionRootDir(room.id),
]));

export const tavernDirectorAgentRoleId = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-${tavernAgentScopeSegment(room)}-director`;

export const tavernCharacterAgentRoleId = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
  character: Pick<TavernCharacter, "id">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-${tavernAgentScopeSegment(room)}-character-${
    sanitizeAgentRoleSegment(character.id, "character")
  }`;

export const tavernManagedUserAgentRoleId = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-${tavernAgentScopeSegment(room)}-user-proxy`;

export const tavernQuickReplyAgentRoleId = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-${tavernAgentScopeSegment(room)}-quick-reply`;

export const tavernQuickNovelAgentRoleId = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-${tavernAgentScopeSegment(room)}-quick-novel`;

export const tavernArchivistAgentRoleId = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-${tavernAgentScopeSegment(room)}-archivist`;

export const tavernProgressTrackerAgentRoleId = (
  room: Pick<TavernRoom, "id" | "activeSceneInstanceId" | "activeSceneId">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-${tavernAgentScopeSegment(room)}-progress-tracker`;
