import type { TavernCharacter, TavernRoom } from "../types";

type TavernBridgeSessionScope = Pick<TavernRoom, "id" | "activeSceneId" | "scenes">;

const sanitizeAgentRoleSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment || fallback;
};

const resolveTavernBridgeSceneId = (
  room: TavernBridgeSessionScope,
  sceneId?: string | null,
) =>
  sceneId?.trim() ||
  room.activeSceneId?.trim() ||
  room.scenes?.[0]?.id?.trim() ||
  room.id;

export const tavernLegacyBridgeSessionRootDir = (roomId: string) =>
  `tavern/${sanitizeAgentRoleSegment(roomId, "room")}/bridge`;

export const tavernBridgeSessionRootDir = (
  roomOrRoomId: TavernBridgeSessionScope | string,
  sceneId?: string | null,
) => {
  if (typeof roomOrRoomId === "string") {
    return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId, "room")}/scenes/${
      sanitizeAgentRoleSegment(sceneId ?? roomOrRoomId, "scene")
    }/bridge`;
  }

  return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId.id, "room")}/scenes/${
    sanitizeAgentRoleSegment(resolveTavernBridgeSceneId(roomOrRoomId, sceneId), "scene")
  }/bridge`;
};

export const tavernBridgeSessionRootDirsForRoom = (
  room: TavernBridgeSessionScope,
) => Array.from(new Set([
  ...(room.scenes?.map((scene) => tavernBridgeSessionRootDir(room, scene.id)) ?? []),
  tavernBridgeSessionRootDir(room),
  tavernLegacyBridgeSessionRootDir(room.id),
]));

export const tavernDirectorAgentRoleId = (room: Pick<TavernRoom, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-director`;

export const tavernCharacterAgentRoleId = (
  room: Pick<TavernRoom, "id">,
  character: Pick<TavernCharacter, "id">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-character-${
    sanitizeAgentRoleSegment(character.id, "character")
  }`;

export const tavernManagedUserAgentRoleId = (room: Pick<TavernRoom, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-user-proxy`;

export const tavernQuickReplyAgentRoleId = (room: Pick<TavernRoom, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-quick-reply`;

export const tavernQuickNovelAgentRoleId = (room: Pick<TavernRoom, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-quick-novel`;

export const tavernArchivistAgentRoleId = (room: Pick<TavernRoom, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-archivist`;

export const tavernProgressTrackerAgentRoleId = (room: Pick<TavernRoom, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.id, "room")}-progress-tracker`;
