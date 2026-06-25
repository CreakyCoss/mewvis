import {
  createTavernDirectorProfileFromCharacters,
  normalizeTavernDirectorProfile,
} from "../core/scheduling-profile";
import {
  DEFAULT_TAVERN_ROOM_SETTINGS,
} from "../defaults";
import {
  clampInteger,
  normalizeStringList,
} from "./normalization";
import {
  normalizeTavernQualityRuleIds,
} from "../prompt-registry/rule-layers/resolver";
import {
  normalizeStatusValue,
} from "./status-normalizers";
import type {
  TavernCharacter,
  TavernDirectorProfile,
  TavernRoomSettings,
} from "../types";

const cloneTavernDirectorProfile = (
  profile: TavernDirectorProfile | undefined,
): TavernDirectorProfile | undefined => profile
  ? {
      ...profile,
      globalGoals: [...profile.globalGoals],
      globalRules: [...profile.globalRules],
      characterProfiles: Object.fromEntries(
        Object.entries(profile.characterProfiles).map(([characterId, characterProfile]) => [
          characterId,
          {
            ...characterProfile,
            interestTags: [...characterProfile.interestTags],
            goalTags: [...characterProfile.goalTags],
            knowledgeTags: [...characterProfile.knowledgeTags],
            speechTriggers: [...characterProfile.speechTriggers],
            silenceTriggers: [...characterProfile.silenceTriggers],
          },
        ]),
      ),
    }
  : undefined;

export const cloneDefaultRoomSettings = (): TavernRoomSettings => ({
  ...DEFAULT_TAVERN_ROOM_SETTINGS,
  interactionQualityRuleIds: [...DEFAULT_TAVERN_ROOM_SETTINGS.interactionQualityRuleIds],
  directorNarrativeControl: { ...DEFAULT_TAVERN_ROOM_SETTINGS.directorNarrativeControl },
  continuation: { ...DEFAULT_TAVERN_ROOM_SETTINGS.continuation },
  replyOptions: { ...DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions },
  statusTracking: { ...DEFAULT_TAVERN_ROOM_SETTINGS.statusTracking },
  randomEvents: { ...DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents },
  illustrationHints: { ...DEFAULT_TAVERN_ROOM_SETTINGS.illustrationHints },
  directorScheduling: {
    ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling,
    directorOnlyPhaseValues: [...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.directorOnlyPhaseValues],
    speakerMotivation: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation,
      rules: DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation.rules.map((rule) => ({ ...rule })),
    },
    profile: cloneTavernDirectorProfile(DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.profile),
    fixedOrder: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder,
      phaseValues: [...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder.phaseValues],
    },
  },
  informationPolicy: {
    ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy,
    hiddenFacts: { ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.hiddenFacts },
    roleAssignment: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment,
      rolePool: DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment.rolePool.map((role) => ({ ...role })),
    },
  },
});

const normalizeInformationRevealMode = (value: unknown) =>
  value === "sceneOutcome" || value === "never" || value === "manual"
    ? value
    : "manual";

const normalizeRoleAssignmentPool = (
  value: unknown,
): TavernRoomSettings["informationPolicy"]["roleAssignment"]["rolePool"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (!label) {
      return [];
    }

    const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const count = typeof candidate.count === "number" && Number.isFinite(candidate.count)
      ? Math.min(20, Math.max(1, Math.round(candidate.count)))
      : 1;
    const description = typeof candidate.description === "string"
      ? candidate.description.trim()
      : "";
    const factionId = typeof candidate.factionId === "string"
      ? candidate.factionId.trim()
      : "";
    const factionLabel = typeof candidate.factionLabel === "string"
      ? candidate.factionLabel.trim()
      : "";

    return [{
      id: rawId || `role-${index + 1}`,
      label,
      ...(description ? { description } : {}),
      ...(factionId ? { factionId } : {}),
      ...(factionLabel ? { factionLabel } : {}),
      count,
    }];
  });
};

const normalizeInformationPolicy = (
  value: unknown,
): TavernRoomSettings["informationPolicy"] => {
  const defaults = cloneDefaultRoomSettings().informationPolicy;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["informationPolicy"]>;
  const hiddenFacts = candidate.hiddenFacts && typeof candidate.hiddenFacts === "object"
    ? candidate.hiddenFacts as Partial<TavernRoomSettings["informationPolicy"]["hiddenFacts"]>
    : {};
  const roleAssignment = candidate.roleAssignment && typeof candidate.roleAssignment === "object"
    ? candidate.roleAssignment as Partial<TavernRoomSettings["informationPolicy"]["roleAssignment"]>
    : {};
  const roleAssignmentOpening = roleAssignment.opening && typeof roleAssignment.opening === "object"
    ? roleAssignment.opening as Partial<TavernRoomSettings["informationPolicy"]["roleAssignment"]["opening"]>
    : {};
  const mode = candidate.mode === "mystery" ||
      candidate.mode === "social_deduction" ||
      candidate.mode === "custom" ||
      candidate.mode === "open"
    ? candidate.mode
    : defaults.mode;
  const uiDefaultView = candidate.uiDefaultView === "public" ||
      candidate.uiDefaultView === "director" ||
      candidate.uiDefaultView === "reveal"
    ? candidate.uiDefaultView
    : defaults.uiDefaultView;
  const defaultVisibility = hiddenFacts.defaultVisibility === "hidden" ||
      hiddenFacts.defaultVisibility === "debug" ||
      hiddenFacts.defaultVisibility === "director"
    ? hiddenFacts.defaultVisibility
    : defaults.hiddenFacts.defaultVisibility;

  return {
    mode,
    uiDefaultView,
    hideCharacterThoughts: Boolean(candidate.hideCharacterThoughts),
    revealThoughts: normalizeInformationRevealMode(candidate.revealThoughts),
    hiddenFacts: {
      enabled: Boolean(hiddenFacts.enabled),
      defaultVisibility,
      reveal: normalizeInformationRevealMode(hiddenFacts.reveal),
    },
    roleAssignment: {
      enabled: Boolean(roleAssignment.enabled),
      strategy: roleAssignment.strategy === "director_random" ? "director_random" : "manual",
      includeUser: roleAssignment.includeUser !== false,
      revealToAssignedCharacter: roleAssignment.revealToAssignedCharacter !== false,
      revealFactionMembers: roleAssignment.revealFactionMembers !== false,
      rolePool: normalizeRoleAssignmentPool(roleAssignment.rolePool),
      opening: {
        autoStart: Boolean(roleAssignmentOpening.autoStart),
        publicEventType: typeof roleAssignmentOpening.publicEventType === "string"
          ? roleAssignmentOpening.publicEventType.trim().slice(0, 80)
          : "",
        ...(roleAssignmentOpening.publicEventValue !== undefined
          ? { publicEventValue: normalizeStatusValue(roleAssignmentOpening.publicEventValue) }
          : {}),
        globalStatusPatches: Array.isArray(roleAssignmentOpening.globalStatusPatches)
          ? roleAssignmentOpening.globalStatusPatches.flatMap((patch) => {
              if (!patch || typeof patch !== "object") {
                return [];
              }
              const record = patch as Record<string, unknown>;
              const statusId = typeof record.statusId === "string" ? record.statusId.trim() : "";
              if (!statusId) {
                return [];
              }
              return [{
                statusId,
                value: normalizeStatusValue(record.value),
              }];
            }).slice(0, 12)
          : [],
      },
    },
  };
};

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
  const fixedOrder = candidate.fixedOrder && typeof candidate.fixedOrder === "object"
    ? candidate.fixedOrder as Partial<TavernRoomSettings["directorScheduling"]["fixedOrder"]>
    : {};
  const speakerMotivation = candidate.speakerMotivation && typeof candidate.speakerMotivation === "object"
    ? candidate.speakerMotivation as Partial<TavernRoomSettings["directorScheduling"]["speakerMotivation"]>
    : {};
  const targetedReplyPolicy = candidate.targetedReplyPolicy === "director" ||
      candidate.targetedReplyPolicy === "prefer" ||
      candidate.targetedReplyPolicy === "exclusive" ||
      candidate.targetedReplyPolicy === "include"
    ? candidate.targetedReplyPolicy
    : defaults.targetedReplyPolicy;
  const autoContinuation = candidate.autoContinuation === "disabled" ||
      candidate.autoContinuation === "disabledForFixedOrder" ||
      candidate.autoContinuation === "enabled"
    ? candidate.autoContinuation
    : defaults.autoContinuation;

  return {
    targetedReplyPolicy,
    maxExtraSpeakersOnTargetedReply: clampInteger(
      candidate.maxExtraSpeakersOnTargetedReply,
      defaults.maxExtraSpeakersOnTargetedReply,
      0,
      5,
    ),
    allowDirectorOnly: Boolean(candidate.allowDirectorOnly),
    directorOnlyPhaseStatusId: typeof candidate.directorOnlyPhaseStatusId === "string"
      ? candidate.directorOnlyPhaseStatusId.trim()
      : "",
    directorOnlyPhaseValues: normalizeStringList(candidate.directorOnlyPhaseValues),
    speakerMotivation: {
      enabled: speakerMotivation.enabled !== false,
      maxMotivatedSpeakers: clampInteger(
        speakerMotivation.maxMotivatedSpeakers,
        defaults.speakerMotivation.maxMotivatedSpeakers,
        0,
        5,
      ),
      rules: Array.isArray(speakerMotivation.rules)
        ? speakerMotivation.rules.flatMap((item, index) => {
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
            return [{
              id: rawId || `speaker-motivation-${index + 1}`,
              label: label.slice(0, 80),
              when: when.slice(0, 240),
              priority: clampInteger(record.priority, 50, 0, 100),
              instruction: instruction.slice(0, 360),
            }];
          }).slice(0, 12)
        : defaults.speakerMotivation.rules.map((rule) => ({ ...rule })),
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
      phaseStatusId: typeof fixedOrder.phaseStatusId === "string"
        ? fixedOrder.phaseStatusId.trim()
        : "",
      phaseValues: normalizeStringList(fixedOrder.phaseValues),
      stopAfterRound: Boolean(fixedOrder.stopAfterRound),
      includeUser: Boolean(fixedOrder.includeUser),
      userPosition: fixedOrder.userPosition === "last" ? "last" : "first",
    },
    autoContinuation,
    instruction: typeof candidate.instruction === "string"
      ? candidate.instruction.trim().slice(0, 1200)
      : "",
  };
};

const normalizeDirectorNarrativeControl = (
  value: unknown,
): TavernRoomSettings["directorNarrativeControl"] => {
  const defaults = cloneDefaultRoomSettings().directorNarrativeControl;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["directorNarrativeControl"]>;
  return {
    agencyMode: candidate.agencyMode === "player_protagonist" ||
        candidate.agencyMode === "story_directive" ||
        candidate.agencyMode === "scene_drive"
      ? candidate.agencyMode
      : defaults.agencyMode,
    responseScale: candidate.responseScale === "focused" ||
        candidate.responseScale === "balanced" ||
        candidate.responseScale === "ensemble"
      ? candidate.responseScale
      : defaults.responseScale,
    narratorPressure: candidate.narratorPressure === "low" ||
        candidate.narratorPressure === "balanced" ||
        candidate.narratorPressure === "high"
      ? candidate.narratorPressure
      : defaults.narratorPressure,
    eventInterruption: candidate.eventInterruption === "off" ||
        candidate.eventInterruption === "auto" ||
        candidate.eventInterruption === "forceOnStall"
      ? candidate.eventInterruption
      : defaults.eventInterruption,
    userActionConsequence: candidate.userActionConsequence === "light" ||
        candidate.userActionConsequence === "visible" ||
        candidate.userActionConsequence === "strict"
      ? candidate.userActionConsequence
      : defaults.userActionConsequence,
    mainHook: candidate.mainHook === "off" ||
        candidate.mainHook === "auto" ||
        candidate.mainHook === "forceOnStall"
      ? candidate.mainHook
      : defaults.mainHook,
    qnaBreak: candidate.qnaBreak === "off" ||
        candidate.qnaBreak === "auto" ||
        candidate.qnaBreak === "aggressive"
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
  const continuation = candidate.continuation && typeof candidate.continuation === "object"
    ? candidate.continuation as Partial<TavernRoomSettings["continuation"]>
    : {};
  const replyOptions = candidate.replyOptions && typeof candidate.replyOptions === "object"
    ? candidate.replyOptions as Partial<TavernRoomSettings["replyOptions"]>
    : {};
  const statusTracking = candidate.statusTracking && typeof candidate.statusTracking === "object"
    ? candidate.statusTracking as Partial<TavernRoomSettings["statusTracking"]>
    : {};
  const randomEvents = candidate.randomEvents && typeof candidate.randomEvents === "object"
    ? candidate.randomEvents as Partial<TavernRoomSettings["randomEvents"]>
    : {};
  const illustrationHints = candidate.illustrationHints && typeof candidate.illustrationHints === "object"
    ? candidate.illustrationHints as Partial<TavernRoomSettings["illustrationHints"]>
    : {};
  const probability = typeof randomEvents.probability === "number"
    ? randomEvents.probability
    : DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents.probability;
  return {
    immersiveDescriptionEnabled: candidate.immersiveDescriptionEnabled !== false,
    showExecutionTrace: Boolean(candidate.showExecutionTrace),
    autoAssetExtractionEnabled: Boolean(candidate.autoAssetExtractionEnabled),
    assetExtractionIntervalTurns: clampInteger(
      candidate.assetExtractionIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.assetExtractionIntervalTurns,
      1,
      10,
    ),
    maxAssetDrafts: clampInteger(
      candidate.maxAssetDrafts,
      DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts,
      1,
      20,
    ),
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
    agentKnowledgeCompactIntervalTurns: clampInteger(
      candidate.agentKnowledgeCompactIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.agentKnowledgeCompactIntervalTurns,
      0,
      50,
    ),
    interactionQualityRuleIds: normalizeTavernQualityRuleIds(
      candidate.interactionQualityRuleIds ?? DEFAULT_TAVERN_ROOM_SETTINGS.interactionQualityRuleIds,
    ),
    directorNarrativeControl: normalizeDirectorNarrativeControl(candidate.directorNarrativeControl),
    directorScheduling: normalizeDirectorScheduling(candidate.directorScheduling, options),
    continuation: {
      enabled: continuation.enabled !== false,
      maxAutoContinuationRounds: clampInteger(
        continuation.maxAutoContinuationRounds,
        DEFAULT_TAVERN_ROOM_SETTINGS.continuation.maxAutoContinuationRounds,
        0,
        3,
      ),
      maxSpeakersPerContinuation: clampInteger(
        continuation.maxSpeakersPerContinuation,
        DEFAULT_TAVERN_ROOM_SETTINGS.continuation.maxSpeakersPerContinuation,
        1,
        3,
      ),
      stopWhenUserTargeted: continuation.stopWhenUserTargeted !== false,
    },
    replyOptions: {
      enabled: replyOptions.enabled !== false,
      count: clampInteger(
        replyOptions.count,
        DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions.count,
        1,
        6,
      ),
    },
    statusTracking: {
      enabled: statusTracking.enabled !== false,
      visibleToUser: statusTracking.visibleToUser !== false,
    },
    randomEvents: {
      enabled: Boolean(randomEvents.enabled),
      probability: Math.min(1, Math.max(0, probability)),
    },
    illustrationHints: {
      enabled: Boolean(illustrationHints.enabled),
    },
    informationPolicy: normalizeInformationPolicy(candidate.informationPolicy),
  };
};
