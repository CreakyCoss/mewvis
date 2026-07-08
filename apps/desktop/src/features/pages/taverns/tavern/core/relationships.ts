import type {
  TavernCharacter,
  TavernCharacterRelationship,
  TavernRelationshipTarget,
  TavernSceneRelationshipOverride,
} from "@/features/pages/taverns/manage/model";

type CharacterLookup = Map<string, TavernCharacter> | TavernCharacter[];
type TavernRelationshipSummaryRoom = {
  userPersonaName?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
};

const asCharacterMap = (characters?: CharacterLookup) =>
  characters instanceof Map ? characters : new Map((characters ?? []).map((character) => [character.id, character]));

const tavernRelationshipTargetKey = (target: TavernRelationshipTarget) =>
  target.type === "user" ? "user" : `character:${target.characterId}`;

const tavernRelationshipTargetsEqual = (left: TavernRelationshipTarget, right: TavernRelationshipTarget) =>
  tavernRelationshipTargetKey(left) === tavernRelationshipTargetKey(right);

const tavernRelationshipTargetLabel = (
  target: TavernRelationshipTarget,
  characters?: CharacterLookup,
  userPersonaName = "我",
) => {
  if (target.type === "user") {
    return userPersonaName || "我";
  }

  return asCharacterMap(characters).get(target.characterId)?.name ?? target.characterId;
};

const relationshipLineParts = ({
  targetLabel,
  relationship,
  sceneOverride,
  includePrivate,
}: {
  targetLabel: string;
  relationship?: TavernCharacterRelationship;
  sceneOverride?: TavernSceneRelationshipOverride;
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
  ].filter(Boolean);

export const formatTavernCharacterRelationships = ({
  character,
  characters,
  userPersonaName = "我",
  relationshipOverrides = [],
  includePrivate = true,
}: {
  character: TavernCharacter;
  characters?: CharacterLookup;
  userPersonaName?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
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
      const line = relationshipLineParts({
        targetLabel: tavernRelationshipTargetLabel(target, characterMap, userPersonaName),
        relationship,
        sceneOverride,
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
  room?: TavernRelationshipSummaryRoom;
  maxItems?: number;
}) => {
  const text = formatTavernCharacterRelationships({
    character,
    characters: characters ?? [],
    userPersonaName: room?.userPersonaName,
    relationshipOverrides: room?.relationshipOverrides,
    includePrivate: false,
  });
  if (!text.trim()) {
    return "";
  }

  return text.split("\n").slice(0, maxItems).join("\n");
};
