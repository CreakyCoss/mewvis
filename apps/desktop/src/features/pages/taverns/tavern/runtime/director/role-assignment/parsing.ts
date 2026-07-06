import {
  createTavernRoleAssignmentFactEvents,
  type TavernRoleAssignmentSelection,
} from "../../../core";
import type {
  TavernCharacter,
  TavernRoom,
} from "../../../types";
import {
  createTavernRoleAssignmentParticipants,
  expandTavernRoleAssignmentPool,
  tavernRoleAssignmentParticipantKey,
} from "./participants";
import type { TavernDirectorRoleAssignment } from "./types";

type ParsedRoleAssignment = {
  assignments?: unknown;
  openingNarrator?: unknown;
  dayAnnouncement?: unknown;
  publicFact?: unknown;
};

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fencedMatch?.[1]?.trim().startsWith("{")) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
};

export const parseTavernDirectorRoleAssignmentText = ({
  text,
  room,
  characters,
  turnId,
  createdAt,
}: {
  text: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  turnId: string;
  createdAt: number;
}): TavernDirectorRoleAssignment => {
  const roleAssignment = room.settings.informationPolicy.roleAssignment;
  const participants = createTavernRoleAssignmentParticipants(room, characters);
  const rolePool = expandTavernRoleAssignmentPool(roleAssignment.rolePool);
  if (participants.length === 0 || rolePool.length !== participants.length) {
    throw new Error(
      `身份池数量必须等于参与者数量：participants=${participants.length}, roles=${rolePool.length}`,
    );
  }

  let parsed: ParsedRoleAssignment;
  try {
    parsed = JSON.parse(extractJsonObject(text)) as ParsedRoleAssignment;
  } catch {
    throw new Error("导演身份分配输出不是合法 JSON。");
  }

  if (!Array.isArray(parsed.assignments)) {
    throw new Error("导演身份分配缺少 assignments 数组。");
  }

  const participantByKey = new Map(
    participants.map((participant) => [
      tavernRoleAssignmentParticipantKey(participant),
      participant,
    ]),
  );
  const roleById = new Map(roleAssignment.rolePool.map((role) => [role.id, role]));
  const roleLimits = new Map(
    roleAssignment.rolePool.map((role) => [
      role.id,
      Math.max(1, Math.round(role.count || 1)),
    ]),
  );
  const roleCounts = new Map<string, number>();
  const seenParticipants = new Set<string>();
  const selections: TavernRoleAssignmentSelection[] = [];

  for (const candidate of parsed.assignments) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const targetType = record.targetType === "user"
      ? "user"
      : record.targetType === "character"
        ? "character"
        : "";
    const rawCharacterId = typeof record.characterId === "string"
      ? record.characterId.trim()
      : "";
    const key = targetType === "user"
      ? "user:user"
      : targetType === "character"
        ? `character:${rawCharacterId}`
        : "";
    const roleId = typeof record.roleId === "string" ? record.roleId.trim() : "";
    const participant = participantByKey.get(key);
    const role = roleById.get(roleId);

    if (!participant || !role || seenParticipants.has(key)) {
      continue;
    }

    const nextRoleCount = (roleCounts.get(role.id) ?? 0) + 1;
    if (nextRoleCount > (roleLimits.get(role.id) ?? 0)) {
      continue;
    }

    roleCounts.set(role.id, nextRoleCount);
    seenParticipants.add(key);
    selections.push({ participant, role });
  }

  const missingParticipants = participants.filter((participant) =>
    !seenParticipants.has(tavernRoleAssignmentParticipantKey(participant))
  );
  const invalidRoleCounts = roleAssignment.rolePool.filter((role) =>
    (roleCounts.get(role.id) ?? 0) !== Math.max(1, Math.round(role.count || 1))
  );
  if (
    missingParticipants.length > 0 ||
    invalidRoleCounts.length > 0 ||
    selections.length !== participants.length
  ) {
    throw new Error([
      "导演身份分配不完整。",
      missingParticipants.length
        ? `missing=${missingParticipants.map((item) => item.label).join(",")}`
        : "",
      invalidRoleCounts.length
        ? `invalidRoles=${invalidRoleCounts.map((role) => role.id).join(",")}`
        : "",
    ].filter(Boolean).join(" "));
  }

  const openingNarrator = typeof parsed.openingNarrator === "string"
    ? parsed.openingNarrator.trim().slice(0, 240)
    : "";
  const dayAnnouncement = typeof parsed.dayAnnouncement === "string"
    ? parsed.dayAnnouncement.trim().slice(0, 360)
    : "";
  const publicFact = typeof parsed.publicFact === "string"
    ? parsed.publicFact.trim().slice(0, 240)
    : "";

  return {
    factEvents: createTavernRoleAssignmentFactEvents({
      room,
      assignments: selections,
      turnId,
      createdAt,
    }),
    openingNarrator,
    dayAnnouncement,
    publicFact,
    rawText: text,
  };
};
