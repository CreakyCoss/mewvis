import type {
  TavernPresentationProfile,
  TavernPresentationProfileId,
  TavernPresentationSettings,
} from "@/features/pages/taverns/manage/model";
import {
  getRegisteredTavernPresentationRules,
  getSelectableTavernPresentationRules,
  registerTavernPresentationRules,
} from "./registry";
import { dialogueChatPresentationRule } from "./rules/dialogue-chat";
import { novelProsePresentationRule } from "./rules/novel-prose";
import { thirdPersonProsePresentationRule } from "./rules/third-person-prose";

export {
  getRegisteredTavernPresentationRules,
  getSelectableTavernPresentationRules,
  registerTavernPresentationRule,
  registerTavernPresentationRules,
} from "./registry";
export type { TavernPresentationRuleRegistration } from "./registry";

export const DEFAULT_TAVERN_PRESENTATION_PROFILE_ID: TavernPresentationProfileId = "dialogue-chat";

registerTavernPresentationRules([
  dialogueChatPresentationRule,
  thirdPersonProsePresentationRule,
  novelProsePresentationRule,
]);

export const TAVERN_PRESENTATION_PROFILES = getRegisteredTavernPresentationRules();
export const TAVERN_PRESENTATION_PROFILE_OPTIONS = getSelectableTavernPresentationRules();

const presentationProfileIds = new Set(TAVERN_PRESENTATION_PROFILES.map((profile) => profile.id));

export const normalizeTavernPresentationProfileId = (value: unknown): TavernPresentationProfileId =>
  typeof value === "string" && presentationProfileIds.has(value as TavernPresentationProfileId)
    ? (value as TavernPresentationProfileId)
    : DEFAULT_TAVERN_PRESENTATION_PROFILE_ID;

export const createDefaultTavernPresentation = (): TavernPresentationSettings => ({
  profileId: DEFAULT_TAVERN_PRESENTATION_PROFILE_ID,
  profileVersion: 1,
});

export const normalizeTavernPresentation = (value: unknown): TavernPresentationSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<TavernPresentationSettings>) : {};

  return {
    profileId: normalizeTavernPresentationProfileId(candidate.profileId),
    profileVersion: 1,
  };
};

export const getTavernPresentationProfile = (value: unknown): TavernPresentationProfile => {
  const id = normalizeTavernPresentationProfileId(value);
  return TAVERN_PRESENTATION_PROFILES.find((profile) => profile.id === id) ?? TAVERN_PRESENTATION_PROFILES[0];
};
