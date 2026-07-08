import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

const sanitizeAgentRoleSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment || fallback;
};

const tavernAgentScopeSegment = (room: TavernRoomRuntime) => sanitizeAgentRoleSegment(room.identity.id, "room");

export const tavernBridgeSessionRootDir = (roomOrRoomId: TavernRoomRuntime | string) => {
  if (typeof roomOrRoomId === "string") {
    return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId, "room")}/bridge`;
  }

  return `tavern/${sanitizeAgentRoleSegment(roomOrRoomId.identity.id, "room")}/bridge`;
};

export const tavernDirectorAgentRoleId = (room: TavernRoomRuntime) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id, "room")}-${tavernAgentScopeSegment(room)}-director`;

export const tavernCharacterAgentRoleId = (room: TavernRoomRuntime, character: Pick<TavernCharacter, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id, "room")}-${tavernAgentScopeSegment(room)}-character-${sanitizeAgentRoleSegment(
    character.id,
    "character",
  )}`;
