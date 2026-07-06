import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { TavernCharacter, TavernRoleAssignmentDefinition } from "@/features/pages/taverns/manage/model";
import type { TavernRoleAssignmentParticipant } from "../../../core";

export const expandTavernRoleAssignmentPool = (rolePool: TavernRoleAssignmentDefinition[]) =>
  rolePool.flatMap((role) => Array.from({ length: Math.max(1, Math.round(role.count || 1)) }, () => role));

export const createTavernRoleAssignmentParticipants = (
  room: TavernRoom,
  characters: TavernCharacter[],
): TavernRoleAssignmentParticipant[] => [
  ...(room.settings.informationPolicy.roleAssignment.includeUser
    ? [
        {
          label: room.userPersonaName.trim() || "你",
          isUser: true,
        },
      ]
    : []),
  ...characters.map((character) => ({
    label: character.name,
    characterId: character.id,
    isUser: false,
  })),
];

export const tavernRoleAssignmentParticipantKey = (participant: TavernRoleAssignmentParticipant) =>
  participant.isUser ? "user:user" : `character:${participant.characterId ?? ""}`;
