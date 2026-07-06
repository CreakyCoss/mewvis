import { normalizeSceneOutcomes, normalizeTaskDefinitions } from "./status-normalizers";
import type {
  TavernCharacterRelationship,
  TavernCondition,
  TavernEntityRef,
  TavernProgressAction,
  TavernReplyOption,
  TavernSceneOutcomeDefinition,
  TavernSceneRelationshipOverride,
  TavernStatusEvent,
  TavernStatusSnapshot,
  TavernStatusTargetRef,
  TavernTaskDefinition,
  TavernRelationshipTarget,
} from "@/features/pages/taverns/manage/model";

export type TavernCharacterIdMapper = (characterId: string) => string | undefined;

export const mapCharacterId = (characterId: string, mapper: TavernCharacterIdMapper) =>
  mapper(characterId) ?? characterId;

const mapTavernRelationshipTarget = (
  target: TavernRelationshipTarget,
  mapper: TavernCharacterIdMapper,
): TavernRelationshipTarget =>
  target.type === "character"
    ? {
        type: "character",
        characterId: mapCharacterId(target.characterId, mapper),
      }
    : target;

export const mapTavernCharacterRelationships = (
  relationships: TavernCharacterRelationship[] | undefined,
  mapper: TavernCharacterIdMapper,
): TavernCharacterRelationship[] =>
  (relationships ?? []).map((relationship) => ({
    ...relationship,
    target: mapTavernRelationshipTarget(relationship.target, mapper),
  }));

export const mapTavernSceneRelationshipOverrides = (
  overrides: TavernSceneRelationshipOverride[] | undefined,
  mapper: TavernCharacterIdMapper,
): TavernSceneRelationshipOverride[] =>
  (overrides ?? []).map((override) => ({
    ...override,
    subjectCharacterId: mapCharacterId(override.subjectCharacterId, mapper),
    target: mapTavernRelationshipTarget(override.target, mapper),
  }));

const tavernEntityRefKey = (entity: TavernEntityRef): string => {
  switch (entity.type) {
    case "user":
      return `user:${entity.userId}`;
    case "character":
      return `character:${entity.characterId}`;
    case "team":
      return `team:${entity.teamId}`;
    case "faction":
      return `faction:${entity.factionId}`;
    case "party":
      return `party:${entity.partyId}`;
    case "scene":
      return `scene:${entity.sceneId}`;
    case "global":
      return "global";
  }
};

const tavernRelationshipStatusKey = (subject: TavernEntityRef, object: TavernEntityRef) =>
  `relationship:${tavernEntityRefKey(subject)}->${tavernEntityRefKey(object)}`;

const parseTavernEntityRefKey = (value: string): TavernEntityRef | null => {
  if (value === "global") {
    return { type: "global" };
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const type = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (!id) {
    return null;
  }
  switch (type) {
    case "user":
      return id === "user" ? { type: "user", userId: "user" } : null;
    case "character":
      return { type: "character", characterId: id };
    case "team":
      return { type: "team", teamId: id };
    case "faction":
      return { type: "faction", factionId: id };
    case "party":
      return { type: "party", partyId: id };
    case "scene":
      return { type: "scene", sceneId: id };
    default:
      return null;
  }
};

const parseTavernRelationshipStatusKey = (value: string) => {
  if (!value.startsWith("relationship:")) {
    return null;
  }
  const rawPair = value.slice("relationship:".length);
  const separatorIndex = rawPair.indexOf("->");
  if (separatorIndex <= 0) {
    return null;
  }
  const subject = parseTavernEntityRefKey(rawPair.slice(0, separatorIndex));
  const object = parseTavernEntityRefKey(rawPair.slice(separatorIndex + 2));
  return subject && object ? { subject, object } : null;
};

const mapTavernEntityRef = (entity: TavernEntityRef, mapper: TavernCharacterIdMapper): TavernEntityRef => {
  if (entity.type === "character") {
    return {
      type: "character",
      characterId: mapCharacterId(entity.characterId, mapper),
    };
  }
  return entity;
};

const mapTavernStatusTargetRef = (
  target: TavernStatusTargetRef,
  mapper: TavernCharacterIdMapper,
): TavernStatusTargetRef => {
  if (target.type === "character") {
    return {
      type: "character",
      characterId: mapCharacterId(target.characterId, mapper),
    };
  }
  if (target.type === "relationship") {
    return {
      type: "relationship",
      subject: mapTavernEntityRef(target.subject, mapper),
      object: mapTavernEntityRef(target.object, mapper),
    };
  }
  return target;
};

const mapTavernCondition = (condition: TavernCondition, mapper: TavernCharacterIdMapper): TavernCondition => {
  if ("all" in condition) {
    return { ...condition, all: condition.all.map((item) => mapTavernCondition(item, mapper)) };
  }
  if ("any" in condition) {
    return { ...condition, any: condition.any.map((item) => mapTavernCondition(item, mapper)) };
  }
  if ("not" in condition) {
    return { ...condition, not: mapTavernCondition(condition.not, mapper) };
  }
  if ("status" in condition && "target" in condition) {
    return {
      ...condition,
      target: mapTavernStatusTargetRef(condition.target, mapper),
    };
  }
  if ("factEvent" in condition) {
    return {
      ...condition,
      ...(condition.actor ? { actor: mapTavernEntityRef(condition.actor, mapper) } : {}),
      ...(condition.target ? { target: mapTavernEntityRef(condition.target, mapper) } : {}),
    };
  }
  if ("task" in condition) {
    return {
      ...condition,
      ...(condition.owner ? { owner: mapTavernEntityRef(condition.owner, mapper) } : {}),
    };
  }
  return condition;
};

const mapTavernReplyOption = (option: TavernReplyOption, mapper: TavernCharacterIdMapper): TavernReplyOption => ({
  ...option,
  targetCharacterIds: option.targetCharacterIds.map((characterId) => mapCharacterId(characterId, mapper)),
});

const mapTavernStatusEvent = (event: TavernStatusEvent, mapper: TavernCharacterIdMapper): TavernStatusEvent => ({
  ...event,
  target: mapTavernStatusTargetRef(event.target, mapper),
});

const mapTavernProgressAction = (
  action: TavernProgressAction,
  mapper: TavernCharacterIdMapper,
): TavernProgressAction => {
  if (action.type === "statusPatch") {
    return {
      ...action,
      statusEvents: action.statusEvents.map((event) => mapTavernStatusEvent(event, mapper)),
    };
  }
  if (action.type === "replyOptions") {
    return {
      ...action,
      options: action.options.map((option) => mapTavernReplyOption(option, mapper)),
    };
  }
  return action;
};

const mapTavernTaskDefinition = (
  task: TavernTaskDefinition,
  mapper: TavernCharacterIdMapper,
): TavernTaskDefinition => ({
  ...task,
  owner: mapTavernEntityRef(task.owner, mapper),
  participants: task.participants?.map((participant) => mapTavernEntityRef(participant, mapper)),
  lifecycle: {
    ...task.lifecycle,
    startCondition: task.lifecycle.startCondition
      ? mapTavernCondition(task.lifecycle.startCondition, mapper)
      : undefined,
    completeCondition: mapTavernCondition(task.lifecycle.completeCondition, mapper),
    failCondition: task.lifecycle.failCondition ? mapTavernCondition(task.lifecycle.failCondition, mapper) : undefined,
  },
  onComplete: task.onComplete?.map((action) => mapTavernProgressAction(action, mapper)),
  onFail: task.onFail?.map((action) => mapTavernProgressAction(action, mapper)),
});

export const mapTavernTaskDefinitions = (value: unknown, mapper: TavernCharacterIdMapper) =>
  Array.isArray(value)
    ? normalizeTaskDefinitions(value, []).map((item) => mapTavernTaskDefinition(item, mapper))
    : value;

const mapTavernSceneOutcomeDefinition = (
  outcome: TavernSceneOutcomeDefinition,
  mapper: TavernCharacterIdMapper,
): TavernSceneOutcomeDefinition => ({
  ...outcome,
  winner: outcome.winner?.map((entity) => mapTavernEntityRef(entity, mapper)),
  loser: outcome.loser?.map((entity) => mapTavernEntityRef(entity, mapper)),
  condition: mapTavernCondition(outcome.condition, mapper),
  onAchieved: outcome.onAchieved?.map((action) => mapTavernProgressAction(action, mapper)),
});

export const mapTavernSceneOutcomeDefinitions = (value: unknown, mapper: TavernCharacterIdMapper) =>
  Array.isArray(value)
    ? normalizeSceneOutcomes(value, []).map((item) => mapTavernSceneOutcomeDefinition(item, mapper))
    : value;

export const mapTavernStatusSnapshot = (value: unknown, mapper: TavernCharacterIdMapper) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  const candidate = value as Partial<TavernStatusSnapshot>;
  const characters = Object.fromEntries(
    Object.entries(candidate.characters ?? {}).map(([characterId, statuses]) => [
      mapCharacterId(characterId, mapper),
      statuses,
    ]),
  );
  const relationships = Object.fromEntries(
    Object.entries(candidate.relationships ?? {}).map(([relationshipKey, statuses]) => {
      const parsed = parseTavernRelationshipStatusKey(relationshipKey);
      if (!parsed) {
        return [relationshipKey, statuses];
      }
      return [
        tavernRelationshipStatusKey(
          mapTavernEntityRef(parsed.subject, mapper),
          mapTavernEntityRef(parsed.object, mapper),
        ),
        statuses,
      ];
    }),
  );

  return {
    ...candidate,
    characters,
    relationships,
  };
};
