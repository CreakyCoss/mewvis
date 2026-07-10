import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

const sanitizeAgentRoleSegment = (value: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment;
};

const tavernAgentScopeSegment = (room: TavernRoomRuntime) => sanitizeAgentRoleSegment(room.identity.id);

export const tavernAgentFlowDirectorRoleId = (room: TavernRoomRuntime) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id)}-${tavernAgentScopeSegment(room)}-flow-director`;

export const tavernAgentFlowCharacterRoleId = (room: TavernRoomRuntime, character: Pick<TavernCharacter, "id">) =>
  `tavern-${sanitizeAgentRoleSegment(room.identity.id)}-${tavernAgentScopeSegment(
    room,
  )}-flow-character-${sanitizeAgentRoleSegment(character.id)}`;
