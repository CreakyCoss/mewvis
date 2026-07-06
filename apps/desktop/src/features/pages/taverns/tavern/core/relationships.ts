import type {
  TavernCharacter,
  TavernCharacterRelationship,
  TavernRelationshipTarget,
  TavernRoom,
  TavernSceneRelationshipOverride,
  TavernStatusSnapshot,
  TavernStatusValue,
} from "@/features/pages/taverns/manage/model";
import { tavernRelationshipKey } from "./progress-engine";

type CharacterLookup = Map<string, TavernCharacter> | TavernCharacter[];

const asCharacterMap = (characters?: CharacterLookup) =>
  characters instanceof Map ? characters : new Map((characters ?? []).map((character) => [character.id, character]));

export const tavernRelationshipTargetKey = (target: TavernRelationshipTarget) =>
  target.type === "user" ? "user" : `character:${target.characterId}`;

export const tavernRelationshipTargetsEqual = (left: TavernRelationshipTarget, right: TavernRelationshipTarget) =>
  tavernRelationshipTargetKey(left) === tavernRelationshipTargetKey(right);

export const tavernRelationshipTargetLabel = (
  target: TavernRelationshipTarget,
  characters?: CharacterLookup,
  userPersonaName = "我",
) => {
  if (target.type === "user") {
    return userPersonaName || "我";
  }

  return asCharacterMap(characters).get(target.characterId)?.name ?? target.characterId;
};

export const tavernRelationshipStatusKey = (subjectCharacterId: string, target: TavernRelationshipTarget) =>
  tavernRelationshipKey(
    { type: "character", characterId: subjectCharacterId },
    target.type === "user" ? { type: "user", userId: "user" } : { type: "character", characterId: target.characterId },
  );

const formatStatusValue = (value: TavernStatusValue) => {
  if (value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join("、");
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return String(value);
};

export const formatTavernRelationshipStatuses = ({
  subjectCharacterId,
  target,
  statusSnapshot,
}: {
  subjectCharacterId: string;
  target: TavernRelationshipTarget;
  statusSnapshot?: TavernStatusSnapshot;
}) => {
  const statuses = statusSnapshot?.relationships[tavernRelationshipStatusKey(subjectCharacterId, target)];
  if (!statuses) {
    return "";
  }

  return Object.entries(statuses)
    .flatMap(([statusId, value]) => {
      const formattedValue = formatStatusValue(value);
      return formattedValue ? [`${statusId}: ${formattedValue}`] : [];
    })
    .join("；");
};

const relationshipLineParts = ({
  targetLabel,
  relationship,
  sceneOverride,
  statusText,
  includePrivate,
}: {
  targetLabel: string;
  relationship?: TavernCharacterRelationship;
  sceneOverride?: TavernSceneRelationshipOverride;
  statusText?: string;
  includePrivate?: boolean;
}) =>
  [
    `对 ${targetLabel}`,
    relationship?.label ? `关系：${relationship.label}` : "",
    relationship?.attitude ? `态度：${relationship.attitude}` : "",
    relationship?.publicNote ? `明面：${relationship.publicNote}` : "",
    includePrivate && relationship?.privateNote ? `私下：${relationship.privateNote}` : "",
    relationship?.tags.length ? `标签：${relationship.tags.join("、")}` : "",
    sceneOverride?.label ? `本场景：${sceneOverride.label}` : "",
    sceneOverride?.publicNote ? `场景明面：${sceneOverride.publicNote}` : "",
    includePrivate && sceneOverride?.privateNote ? `场景私下：${sceneOverride.privateNote}` : "",
    sceneOverride?.tags.length ? `场景标签：${sceneOverride.tags.join("、")}` : "",
    statusText ? `动态状态：${statusText}` : "",
  ].filter(Boolean);

export const formatTavernCharacterRelationships = ({
  character,
  characters,
  userPersonaName = "我",
  relationshipOverrides = [],
  statusSnapshot,
  includePrivate = true,
}: {
  character: TavernCharacter;
  characters?: CharacterLookup;
  userPersonaName?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  statusSnapshot?: TavernStatusSnapshot;
  includePrivate?: boolean;
}) => {
  const characterMap = asCharacterMap(characters);
  const baseRelationships = character.relationships ?? [];
  const matchingOverrides = relationshipOverrides.filter((override) => override.subjectCharacterId === character.id);
  const mergedTargets = [
    ...baseRelationships.map((relationship) => relationship.target),
    ...matchingOverrides.map((override) => override.target),
  ];
  const uniqueTargets = Array.from(
    new Map(mergedTargets.map((target) => [tavernRelationshipTargetKey(target), target])).values(),
  );

  return uniqueTargets
    .map((target) => {
      const relationship = baseRelationships.find((item) => tavernRelationshipTargetsEqual(item.target, target));
      const sceneOverride = matchingOverrides.find((item) => tavernRelationshipTargetsEqual(item.target, target));
      const statusText = formatTavernRelationshipStatuses({
        subjectCharacterId: character.id,
        target,
        statusSnapshot,
      });
      const line = relationshipLineParts({
        targetLabel: tavernRelationshipTargetLabel(target, characterMap, userPersonaName),
        relationship,
        sceneOverride,
        statusText,
        includePrivate,
      });
      return line.length > 1 ? line.join("；") : "";
    })
    .filter(Boolean)
    .join("\n");
};

export const formatTavernCharacterRelationshipSummary = ({
  character,
  characters,
  room,
  maxItems = 2,
}: {
  character: TavernCharacter;
  characters?: CharacterLookup;
  room?: TavernRoom;
  maxItems?: number;
}) => {
  const text = formatTavernCharacterRelationships({
    character,
    characters: characters ?? room?.localCharacters ?? [],
    userPersonaName: room?.userPersonaName,
    relationshipOverrides: room?.relationshipOverrides,
    statusSnapshot: room?.statusSnapshot,
    includePrivate: false,
  });
  if (!text.trim()) {
    return "";
  }

  return text.split("\n").slice(0, maxItems).join("\n");
};
