import { cloneDeep } from "lodash-es";
import { createTavernDirectorProfileFromCharacters, normalizeTavernDirectorProfile } from "../core/scheduling-profile";
import { DEFAULT_TAVERN_ROOM_SETTINGS } from "../defaults";
import { clampInteger } from "./normalization";
import { normalizeTavernQualityRuleIds } from "../prompt-registry/rule-layers/resolver";
import type { TavernCharacter, TavernDirectorProfile, TavernRoomSettings } from "@/features/pages/taverns/manage/model";

export const cloneDefaultRoomSettings = (): TavernRoomSettings => cloneDeep(DEFAULT_TAVERN_ROOM_SETTINGS);

const normalizeDirectorScheduling = (
  value: unknown,
  options: {
    characters?: TavernCharacter[];
    characterIds?: string[];
    mapCharacterId?: (characterId: string) => string | undefined;
    profileSource?: TavernDirectorProfile["source"];
    updatedAt?: number;
  } = {},
): TavernRoomSettings["directorScheduling"] => {
  const defaults = cloneDefaultRoomSettings().directorScheduling;
  const defaultsWithProfile = options.characters?.length
    ? {
        ...defaults,
        profile: createTavernDirectorProfileFromCharacters({
          characters: options.characters,
          source: options.profileSource ?? "system",
          updatedAt: options.updatedAt,
        }),
      }
    : defaults;
  if (!value || typeof value !== "object") {
    return defaultsWithProfile;
  }

  const candidate = value as Partial<TavernRoomSettings["directorScheduling"]>;
  const fixedOrder =
    candidate.fixedOrder && typeof candidate.fixedOrder === "object"
      ? (candidate.fixedOrder as Partial<TavernRoomSettings["directorScheduling"]["fixedOrder"]>)
      : {};
  const speakerMotivation =
    candidate.speakerMotivation && typeof candidate.speakerMotivation === "object"
      ? (candidate.speakerMotivation as Partial<TavernRoomSettings["directorScheduling"]["speakerMotivation"]>)
      : {};
  const targetedReplyPolicy =
    candidate.targetedReplyPolicy === "director" ||
    candidate.targetedReplyPolicy === "prefer" ||
    candidate.targetedReplyPolicy === "exclusive" ||
    candidate.targetedReplyPolicy === "include"
      ? candidate.targetedReplyPolicy
      : defaults.targetedReplyPolicy;

  return {
    targetedReplyPolicy,
    maxExtraSpeakersOnTargetedReply: clampInteger(
      candidate.maxExtraSpeakersOnTargetedReply,
      defaults.maxExtraSpeakersOnTargetedReply,
      0,
      5,
    ),
    allowDirectorOnly: Boolean(candidate.allowDirectorOnly),
    speakerMotivation: {
      enabled: speakerMotivation.enabled !== false,
      maxMotivatedSpeakers: clampInteger(
        speakerMotivation.maxMotivatedSpeakers,
        defaults.speakerMotivation.maxMotivatedSpeakers,
        0,
        5,
      ),
      rules: Array.isArray(speakerMotivation.rules)
        ? speakerMotivation.rules
            .flatMap((item, index) => {
              if (!item || typeof item !== "object") {
                return [];
              }
              const record = item as Record<string, unknown>;
              const label = typeof record.label === "string" ? record.label.trim() : "";
              const when = typeof record.when === "string" ? record.when.trim() : "";
              const instruction = typeof record.instruction === "string" ? record.instruction.trim() : "";
              if (!label || !when || !instruction) {
                return [];
              }
              const rawId = typeof record.id === "string" ? record.id.trim() : "";
              return [
                {
                  id: rawId || `speaker-motivation-${index + 1}`,
                  label: label.slice(0, 80),
                  when: when.slice(0, 240),
                  priority: clampInteger(record.priority, 50, 0, 100),
                  instruction: instruction.slice(0, 360),
                },
              ];
            })
            .slice(0, 12)
        : cloneDeep(defaults.speakerMotivation.rules),
    },
    profile: normalizeTavernDirectorProfile(candidate.profile, {
      characters: options.characters,
      characterIds: options.characterIds,
      mapCharacterId: options.mapCharacterId,
      source: options.profileSource,
      updatedAt: options.updatedAt,
    }),
    fixedOrder: {
      enabled: Boolean(fixedOrder.enabled),
      stopAfterRound: Boolean(fixedOrder.stopAfterRound),
      includeUser: Boolean(fixedOrder.includeUser),
      userPosition: fixedOrder.userPosition === "last" ? "last" : "first",
    },
    instruction: typeof candidate.instruction === "string" ? candidate.instruction.trim().slice(0, 1200) : "",
  };
};

const normalizeDirectorNarrativeControl = (value: unknown): TavernRoomSettings["directorNarrativeControl"] => {
  const defaults = cloneDefaultRoomSettings().directorNarrativeControl;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["directorNarrativeControl"]>;
  return {
    agencyMode:
      candidate.agencyMode === "player_protagonist" ||
      candidate.agencyMode === "story_directive" ||
      candidate.agencyMode === "scene_drive"
        ? candidate.agencyMode
        : defaults.agencyMode,
    responseScale:
      candidate.responseScale === "focused" ||
      candidate.responseScale === "balanced" ||
      candidate.responseScale === "ensemble"
        ? candidate.responseScale
        : defaults.responseScale,
    narratorPressure:
      candidate.narratorPressure === "low" ||
      candidate.narratorPressure === "balanced" ||
      candidate.narratorPressure === "high"
        ? candidate.narratorPressure
        : defaults.narratorPressure,
    eventInterruption:
      candidate.eventInterruption === "off" ||
      candidate.eventInterruption === "auto" ||
      candidate.eventInterruption === "forceOnStall"
        ? candidate.eventInterruption
        : defaults.eventInterruption,
    userActionConsequence:
      candidate.userActionConsequence === "light" ||
      candidate.userActionConsequence === "visible" ||
      candidate.userActionConsequence === "strict"
        ? candidate.userActionConsequence
        : defaults.userActionConsequence,
    mainHook:
      candidate.mainHook === "off" || candidate.mainHook === "auto" || candidate.mainHook === "forceOnStall"
        ? candidate.mainHook
        : defaults.mainHook,
    qnaBreak:
      candidate.qnaBreak === "off" || candidate.qnaBreak === "auto" || candidate.qnaBreak === "aggressive"
        ? candidate.qnaBreak
        : defaults.qnaBreak,
  };
};

export const normalizeRoomSettings = (
  value: unknown,
  options: {
    characters?: TavernCharacter[];
    characterIds?: string[];
    mapCharacterId?: (characterId: string) => string | undefined;
    profileSource?: TavernDirectorProfile["source"];
    updatedAt?: number;
  } = {},
): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    const defaults = cloneDefaultRoomSettings();
    return {
      ...defaults,
      directorScheduling: normalizeDirectorScheduling(undefined, options),
    };
  }

  const candidate = value as Partial<TavernRoomSettings>;
  const directorLoop =
    candidate.directorLoop && typeof candidate.directorLoop === "object"
      ? (candidate.directorLoop as Partial<TavernRoomSettings["directorLoop"]>)
      : {};
  return {
    immersiveDescriptionEnabled: candidate.immersiveDescriptionEnabled !== false,
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
    directorLoop: {
      enabled: directorLoop.enabled !== false,
      maxRounds: clampInteger(directorLoop.maxRounds, DEFAULT_TAVERN_ROOM_SETTINGS.directorLoop.maxRounds, 1, 5),
    },
    interactionQualityRuleIds: normalizeTavernQualityRuleIds(
      candidate.interactionQualityRuleIds ?? DEFAULT_TAVERN_ROOM_SETTINGS.interactionQualityRuleIds,
    ),
    directorNarrativeControl: normalizeDirectorNarrativeControl(candidate.directorNarrativeControl),
    directorScheduling: normalizeDirectorScheduling(candidate.directorScheduling, options),
  };
};
