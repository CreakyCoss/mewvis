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

export const tavernAgentFlowSessionRootDir = (room: TavernRoomRuntime) =>
  `tavern/${sanitizeAgentRoleSegment(room.identity.id, "room")}/agent-flow`;

export const tavernAgentFlowDirectorRoleId = (room: TavernRoomRuntime) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id, "room")}-${tavernAgentScopeSegment(room)}-flow-director`;

export const tavernAgentFlowCharacterRoleId = (
  room: TavernRoomRuntime,
  character: Pick<TavernCharacter, "id">,
) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id, "room")}-${tavernAgentScopeSegment(
    room,
  )}-flow-character-${sanitizeAgentRoleSegment(character.id, "character")}`;
