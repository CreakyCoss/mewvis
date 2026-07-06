import type { TavernCharacter, TavernPendingInteraction } from "@/features/pages/taverns/manage/model";

export type TavernContinuationPlan = {
  shouldContinue: boolean;
  speakerIds: string[];
  interactionIds: string[];
  reason: "character_targeted" | "user_targeted" | "group_targeted" | "none" | "limit_reached";
};

export type PlanTavernContinuationInput = {
  pendingInteractions: TavernPendingInteraction[];
  characters: TavernCharacter[];
  continuationRound: number;
  maxAutoContinuationRounds: number;
  maxSpeakersPerContinuation: number;
  stopWhenUserTargeted: boolean;
};

export const planTavernContinuation = ({
  pendingInteractions,
  characters,
  continuationRound,
  maxAutoContinuationRounds,
  maxSpeakersPerContinuation,
  stopWhenUserTargeted,
}: PlanTavernContinuationInput): TavernContinuationPlan => {
  if (continuationRound >= maxAutoContinuationRounds) {
    return {
      shouldContinue: false,
      speakerIds: [],
      interactionIds: [],
      reason: "limit_reached",
    };
  }

  const characterIds = new Set(characters.map((character) => character.id));
  const openInteractions = pendingInteractions.filter(
    (interaction) => interaction.status === "open" && interaction.requiresResponse,
  );
  const userTargeted = openInteractions.find((interaction) => interaction.target.type === "user");
  if (userTargeted && stopWhenUserTargeted) {
    return {
      shouldContinue: false,
      speakerIds: [],
      interactionIds: [userTargeted.id],
      reason: "user_targeted",
    };
  }

  const characterTargeted = openInteractions.find(
    (interaction) =>
      interaction.target.type === "character" &&
      (interaction.target.characterIds ?? []).some((characterId) => characterIds.has(characterId)),
  );
  if (characterTargeted) {
    const speakerIds = [...new Set(characterTargeted.target.characterIds ?? [])]
      .filter((characterId) => characterIds.has(characterId))
      .slice(0, Math.max(1, maxSpeakersPerContinuation));
    return {
      shouldContinue: speakerIds.length > 0,
      speakerIds,
      interactionIds: [characterTargeted.id],
      reason: "character_targeted",
    };
  }

  return {
    shouldContinue: false,
    speakerIds: [],
    interactionIds: [],
    reason: openInteractions.some((interaction) => interaction.target.type === "group") ? "group_targeted" : "none",
  };
};
