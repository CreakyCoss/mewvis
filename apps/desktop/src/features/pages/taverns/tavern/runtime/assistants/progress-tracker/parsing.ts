import type { TavernMessage } from "../../../types";
import type {
  TavernCharacter,
  TavernEntityRef,
  TavernEventIntensity,
  TavernFactEvent,
  TavernProgressVisibility,
  TavernRoom,
} from "@/features/pages/taverns/manage/model";

const EVENT_INTENSITIES = new Set<TavernEventIntensity>(["trivial", "minor", "moderate", "major", "critical"]);

const FACT_VISIBILITIES = new Set<TavernProgressVisibility>([
  "public",
  "owner",
  "team",
  "private",
  "director",
  "hidden",
  "debug",
]);

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const clampConfidence = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
};

const normalizeEntityRef = (value: unknown, characterIds: Set<string>): TavernEntityRef | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "user") {
    return { type: "user", userId: "user" };
  }
  if (candidate.type === "character") {
    const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
    return characterIds.has(characterId) ? { type: "character", characterId } : undefined;
  }
  if (candidate.type === "global") {
    return { type: "global" };
  }
  if (candidate.type === "scene") {
    const sceneId =
      typeof candidate.sceneId === "string" && candidate.sceneId.trim() ? candidate.sceneId.trim() : undefined;
    return sceneId ? { type: "scene", sceneId } : { type: "scene", sceneId: "current" };
  }
  if (candidate.type === "party") {
    const partyId = typeof candidate.partyId === "string" ? candidate.partyId.trim() : "";
    return partyId ? { type: "party", partyId } : undefined;
  }
  if (candidate.type === "team") {
    const teamId = typeof candidate.teamId === "string" ? candidate.teamId.trim() : "";
    return teamId ? { type: "team", teamId } : undefined;
  }
  if (candidate.type === "faction") {
    const factionId = typeof candidate.factionId === "string" ? candidate.factionId.trim() : "";
    return factionId ? { type: "faction", factionId } : undefined;
  }
  return undefined;
};

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])) : [];

const normalizeFactVisibility = (value: unknown, fallback: TavernProgressVisibility) =>
  typeof value === "string" && FACT_VISIBILITIES.has(value as TavernProgressVisibility)
    ? (value as TavernProgressVisibility)
    : fallback;

const normalizeFactRevealWhen = (value: unknown) =>
  value === "sceneOutcome" || value === "never" || value === "manual" ? value : undefined;

export const parseTavernProgressFactEvents = ({
  text,
  room,
  characters,
  sourceMessages,
  turnId,
}: {
  text: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  sourceMessages: TavernMessage[];
  turnId: string;
}): TavernFactEvent[] => {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  const allowedEventTypes = new Set(room.statusRules.map((rule) => rule.when.eventType));
  const characterIds = new Set(characters.map((character) => character.id));
  const sourceMessageIds = new Set(sourceMessages.map((message) => message.id));
  const fallbackSourceMessageIds = sourceMessages.map((message) => message.id);
  const minConfidence = room.progressTracker.factConfidenceThreshold;

  return Array.isArray(parsed.factEvents)
    ? parsed.factEvents
        .flatMap((value, index): TavernFactEvent[] => {
          if (!value || typeof value !== "object") {
            return [];
          }

          const candidate = value as Record<string, unknown>;
          const type = typeof candidate.type === "string" ? candidate.type.trim() : "";
          if (!allowedEventTypes.has(type)) {
            return [];
          }

          const evidence = typeof candidate.evidence === "string" ? candidate.evidence.trim() : "";
          const confidence = clampConfidence(candidate.confidence);
          if (!evidence || confidence < minConfidence) {
            return [];
          }

          const actor = normalizeEntityRef(candidate.actor, characterIds);
          const target = normalizeEntityRef(candidate.target, characterIds);
          const rawIntensity = typeof candidate.intensity === "string" ? candidate.intensity.trim() : "";
          const intensity = EVENT_INTENSITIES.has(rawIntensity as TavernEventIntensity)
            ? (rawIntensity as TavernEventIntensity)
            : undefined;
          const valueNumber =
            typeof candidate.value === "number" && Number.isFinite(candidate.value) ? candidate.value : undefined;
          const candidateSourceMessageIds = Array.isArray(candidate.sourceMessageIds)
            ? candidate.sourceMessageIds.flatMap((id) =>
                typeof id === "string" && sourceMessageIds.has(id) ? [id] : [],
              )
            : [];
          const fallbackVisibility = room.settings.informationPolicy.hiddenFacts.enabled
            ? room.settings.informationPolicy.hiddenFacts.defaultVisibility
            : "public";
          const visibility = normalizeFactVisibility(candidate.visibility, fallbackVisibility);
          const visibleToUser = candidate.visibleToUser === true;
          const visibleToCharacterIds = normalizeStringArray(candidate.visibleToCharacterIds).filter((characterId) =>
            characterIds.has(characterId),
          );
          const visibleToFactionIds = normalizeStringArray(candidate.visibleToFactionIds);
          const revealWhen =
            normalizeFactRevealWhen(candidate.revealWhen) ??
            (visibility === "public" ? undefined : room.settings.informationPolicy.hiddenFacts.reveal);

          return [
            {
              id: `${turnId}-fact-${index + 1}-${type}`,
              turnId,
              sourceMessageIds:
                candidateSourceMessageIds.length > 0 ? candidateSourceMessageIds : fallbackSourceMessageIds,
              type,
              ...(actor ? { actor } : {}),
              ...(target ? { target } : {}),
              ...(intensity ? { intensity } : {}),
              ...(typeof valueNumber === "number" ? { value: valueNumber } : {}),
              evidence,
              confidence,
              visibility,
              ...(revealWhen ? { revealWhen } : {}),
              ...(visibleToUser ? { visibleToUser } : {}),
              ...(visibleToCharacterIds.length > 0 ? { visibleToCharacterIds } : {}),
              ...(visibleToFactionIds.length > 0 ? { visibleToFactionIds } : {}),
              createdAt: Date.now(),
            },
          ];
        })
        .slice(0, 12)
    : [];
};
