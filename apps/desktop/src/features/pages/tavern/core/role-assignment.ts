import type {
  TavernCharacter,
  TavernEntityRef,
  TavernFactEvent,
  TavernRoleAssignmentDefinition,
  TavernRoom,
} from "../types";

const generatedRoleAssignmentPrefix = "role-assignment";

type TavernRoleAssignmentParticipant = {
  entity: TavernEntityRef;
  label: string;
  characterId?: string;
  isUser: boolean;
};

const shuffle = <T,>(items: T[], random: () => number) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[targetIndex]] = [copy[targetIndex], copy[index]];
  }
  return copy;
};

const expandRolePool = (rolePool: TavernRoleAssignmentDefinition[]) =>
  rolePool.flatMap((role) =>
    Array.from({ length: Math.max(1, Math.round(role.count || 1)) }, () => role)
  );

const roleFactionLabel = (role: TavernRoleAssignmentDefinition) =>
  role.factionLabel?.trim() || role.factionId?.trim() || "";

const roleEvidence = (
  participant: TavernRoleAssignmentParticipant,
  role: TavernRoleAssignmentDefinition,
) => [
  `${participant.label} 的身份：${role.label}`,
  roleFactionLabel(role) ? `阵营：${roleFactionLabel(role)}` : "",
  role.description?.trim() || "",
].filter(Boolean).join("\n");

export const isGeneratedTavernRoleAssignmentFactEvent = (event: TavernFactEvent) =>
  event.id.startsWith(`${generatedRoleAssignmentPrefix}-`) &&
  event.type === "role_assignment";

export const assignTavernRoleFacts = ({
  room,
  characters,
  random = Math.random,
  turnId = `${generatedRoleAssignmentPrefix}-${Date.now().toString(36)}`,
  createdAt = Date.now(),
}: {
  room: Pick<TavernRoom, "settings" | "userPersonaName">;
  characters: TavernCharacter[];
  random?: () => number;
  turnId?: string;
  createdAt?: number;
}): TavernFactEvent[] => {
  const roleAssignment = room.settings.informationPolicy.roleAssignment;
  if (!roleAssignment.enabled || roleAssignment.rolePool.length === 0) {
    return [];
  }

  const participants: TavernRoleAssignmentParticipant[] = [
    ...(roleAssignment.includeUser
      ? [{
          entity: { type: "user", userId: "user" } as const,
          label: room.userPersonaName.trim() || "我",
          isUser: true,
        }]
      : []),
    ...characters.map((character) => ({
      entity: { type: "character", characterId: character.id } as const,
      label: character.name,
      characterId: character.id,
      isUser: false,
    })),
  ];
  const roles = expandRolePool(roleAssignment.rolePool);
  if (participants.length === 0 || roles.length === 0) {
    return [];
  }

  const shuffledParticipants = shuffle(participants, random);
  const shuffledRoles = shuffle(roles, random);
  const assignments = shuffledParticipants
    .slice(0, shuffledRoles.length)
    .map((participant, index) => ({
      participant,
      role: shuffledRoles[index],
    }));
  const userFactionIds = new Set(assignments.flatMap(({ participant, role }) =>
    participant.isUser && role.factionId ? [role.factionId] : []
  ));

  return assignments.map(({ participant, role }, index) => {
    const visibleToCharacterIds = roleAssignment.revealToAssignedCharacter && participant.characterId
      ? [participant.characterId]
      : [];
    const visibleToFactionIds = roleAssignment.revealFactionMembers && role.factionId
      ? [role.factionId]
      : [];
    const visibleToUser = (
      roleAssignment.revealToAssignedCharacter && participant.isUser
    ) || (
      roleAssignment.revealFactionMembers &&
      Boolean(role.factionId && userFactionIds.has(role.factionId))
    );

    return {
      id: `${generatedRoleAssignmentPrefix}-${turnId}-${index + 1}`,
      turnId,
      sourceMessageIds: [],
      type: "role_assignment",
      target: participant.entity,
      evidence: roleEvidence(participant, role),
      confidence: 1,
      visibility: "private",
      revealWhen: room.settings.informationPolicy.hiddenFacts.reveal,
      ...(visibleToUser ? { visibleToUser } : {}),
      ...(visibleToCharacterIds.length > 0 ? { visibleToCharacterIds } : {}),
      ...(visibleToFactionIds.length > 0 ? { visibleToFactionIds } : {}),
      createdAt: createdAt + index,
    };
  });
};
