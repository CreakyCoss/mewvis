import type { TavernCharacter, TavernRoom } from "../types";

const sanitizeAgentRoleSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment || fallback;
};

export const tavernBridgeSessionRootDir = (roomId: string) =>
  `tavern/${sanitizeAgentRoleSegment(roomId, "room")}/bridge`;

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
