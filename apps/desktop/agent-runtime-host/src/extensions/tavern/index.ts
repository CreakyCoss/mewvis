import type {
  CollaborationExtension,
} from "../../../../agent-runtime/src/index.js";
import {
  parseTavernDirectorDecision,
} from "../../../../src/features/pages/tavern/runtime/director/decision";

type TavernDirectorDecisionParserCharacters = Parameters<
  typeof parseTavernDirectorDecision
>[1];

type NormalizeDirectorDecisionInput = {
  raw?: unknown;
  text?: unknown;
  characters?: unknown;
  maxSpeakers?: unknown;
  allowRandomEvent?: unknown;
  allowIllustrationHints?: unknown;
};

type TavernRouteDecision = {
  speakerIds?: unknown;
  nonverbalReplyIds?: unknown;
  narrator?: unknown;
};

type ShouldRunSpeakerInput = {
  decision?: unknown;
  characterId?: unknown;
};

type DirectorLoopRouteInput = {
  round?: unknown;
  current?: unknown;
  maxRounds?: unknown;
};

export const tavernCollaborationExtensionNamespace = "tavern";

export const createTavernCollaborationExtension = (): CollaborationExtension => ({
  namespace: tavernCollaborationExtensionNamespace,
  transforms: {
    normalizeDirectorDecision: (input) => {
      const normalizedInput = normalizeDirectorDecisionInput(input);
      return parseTavernDirectorDecision(
        normalizedInput.rawText,
        normalizedInput.characters,
        normalizedInput.maxSpeakers,
        normalizedInput.allowRandomEvent,
        normalizedInput.allowIllustrationHints,
      );
    },
    incrementDirectorLoopRound: (input) => incrementLoopRound(input),
  },
  conditions: {
    hasScheduledSpeakers: (input) => hasScheduledSpeakers(input),
    hasNarrator: (input) => hasNarrator(input),
    shouldRunSpeaker: (input) => shouldRunSpeaker(input),
  },
  routers: {
    directorNextRoute: (input) => {
      const route = resolveDirectorNextRoute(input);
      return {
        route,
        output: {
          route,
          decision: input,
        },
      };
    },
    directorLoopRoute: (input) => {
      const route = resolveDirectorLoopRoute(input);
      return {
        route,
        output: {
          route,
          round: normalizeLoopRound(input),
          maxRounds: normalizeDirectorLoopMaxRounds(input),
        },
      };
    },
  },
});

const normalizeDirectorDecisionInput = (
  input: unknown,
) => {
  const record = isRecord(input) ? input as NormalizeDirectorDecisionInput : {};
  const rawText = typeof record.raw === "string"
    ? record.raw
    : typeof record.text === "string"
    ? record.text
    : typeof input === "string"
    ? input
    : "";

  return {
    rawText,
    characters: normalizeCharacters(record.characters),
    maxSpeakers: normalizePositiveInteger(record.maxSpeakers, 3),
    allowRandomEvent: record.allowRandomEvent !== false,
    allowIllustrationHints: record.allowIllustrationHints !== false,
  };
};

const normalizeCharacters = (
  value: unknown,
): TavernDirectorDecisionParserCharacters => {
  if (!Array.isArray(value)) {
    return [] as unknown as TavernDirectorDecisionParserCharacters;
  }

  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      return [];
    }
    const id = stringValue(candidate.id);
    if (!id) {
      return [];
    }
    return [{
      ...candidate,
      id,
      name: stringValue(candidate.name) || id,
    }];
  }) as unknown as TavernDirectorDecisionParserCharacters;
};

const normalizePositiveInteger = (
  value: unknown,
  fallback: number,
) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.max(1, Math.floor(numberValue));
};

const incrementLoopRound = (input: unknown) => normalizeLoopRound(input) + 1;

const normalizeLoopRound = (input: unknown) => {
  const value = isRecord(input)
    ? (input as DirectorLoopRouteInput).round ?? (input as DirectorLoopRouteInput).current
    : input;
  const numberValue = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }
  return Math.max(0, Math.floor(numberValue));
};

const normalizeDirectorLoopMaxRounds = (input: unknown) => {
  const value = isRecord(input)
    ? (input as DirectorLoopRouteInput).maxRounds
    : undefined;
  return normalizePositiveInteger(value, 1);
};

const resolveDirectorNextRoute = (input: unknown) => {
  if (hasScheduledSpeakers(input)) {
    return "speakers";
  }
  if (hasNarrator(input)) {
    return "narrator";
  }
  return "end";
};

const resolveDirectorLoopRoute = (input: unknown) =>
  normalizeLoopRound(input) < normalizeDirectorLoopMaxRounds(input) ? "director" : "end";

const hasScheduledSpeakers = (input: unknown) => {
  const decision = isRecord(input) ? input as TavernRouteDecision : {};
  return hasStringItems(decision.speakerIds) || hasStringItems(decision.nonverbalReplyIds);
};

const shouldRunSpeaker = (input: unknown) => {
  const request = isRecord(input) ? input as ShouldRunSpeakerInput : {};
  const characterId = stringValue(request.characterId);
  if (!characterId) {
    return false;
  }

  const decision = isRecord(request.decision)
    ? request.decision as TavernRouteDecision
    : isRecord(input)
    ? input as TavernRouteDecision
    : {};

  return stringArrayIncludes(decision.speakerIds, characterId) ||
    stringArrayIncludes(decision.nonverbalReplyIds, characterId);
};

const hasNarrator = (input: unknown) => {
  const decision = isRecord(input) ? input as TavernRouteDecision : {};
  return typeof decision.narrator === "string" && decision.narrator.trim().length > 0;
};

const hasStringItems = (value: unknown) =>
  Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);

const stringArrayIncludes = (value: unknown, expected: string) =>
  Array.isArray(value) && value.some((item) => stringValue(item) === expected);

const stringValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
