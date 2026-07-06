import type {
  TavernPresentationProfile,
  TavernPresentationProfileId,
} from "../../types";

export type TavernPresentationRuleRegistration = TavernPresentationProfile & {
  selectable?: boolean;
  order?: number;
};

type TavernPresentationRuleRegistryEntry = TavernPresentationProfile & {
  selectable: boolean;
  order: number;
};

const presentationRuleRegistry = new Map<
  TavernPresentationProfileId,
  TavernPresentationRuleRegistryEntry
>();

const toPresentationProfile = (
  entry: TavernPresentationRuleRegistryEntry,
): TavernPresentationProfile => ({
  id: entry.id,
  label: entry.label,
  description: entry.description,
  perspective: entry.perspective,
  dialoguePolicy: entry.dialoguePolicy,
  userInputMode: entry.userInputMode,
  renderStyle: entry.renderStyle,
  generationContract: entry.generationContract,
  bridgeSystemAddendum: entry.bridgeSystemAddendum,
  directorAddendum: entry.directorAddendum,
  characterAddendum: entry.characterAddendum,
  composerPlaceholder: entry.composerPlaceholder,
});

const getOrderedPresentationRuleEntries = () =>
  Array.from(presentationRuleRegistry.values())
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));

export const registerTavernPresentationRule = (
  rule: TavernPresentationRuleRegistration,
) => {
  if (presentationRuleRegistry.has(rule.id)) {
    throw new Error(`Duplicate tavern presentation rule id: ${rule.id}`);
  }

  presentationRuleRegistry.set(rule.id, {
    ...rule,
    selectable: rule.selectable !== false,
    order: rule.order ?? presentationRuleRegistry.size * 10,
  });
};

export const registerTavernPresentationRules = (
  rules: TavernPresentationRuleRegistration[],
) => {
  rules.forEach(registerTavernPresentationRule);
};

export const getRegisteredTavernPresentationRules = () =>
  getOrderedPresentationRuleEntries().map(toPresentationProfile);

export const getSelectableTavernPresentationRules = () =>
  getOrderedPresentationRuleEntries()
    .filter((entry) => entry.selectable)
    .map(toPresentationProfile);
