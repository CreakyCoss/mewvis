import type {
  TavernSystemNarrativePresetId,
  TavernSystemNarrativePresetSettings,
} from "@/features/pages/taverns/manage/model";

export type TavernSystemNarrativeRuleSet = {
  narrativeBeat: string[];
  dialogueImmersive: string[];
  dialoguePlain: string[];
};

export type TavernSystemNarrativePreset = {
  id: TavernSystemNarrativePresetId;
  label: string;
  description: string;
  bridgeAddendum: string;
  directorAddendum: string;
  characterRules: TavernSystemNarrativeRuleSet;
};

export type TavernSystemNarrativeStyleRegistration = TavernSystemNarrativePreset & {
  selectable?: boolean;
  order?: number;
};

type TavernSystemNarrativeStyleRegistryEntry = TavernSystemNarrativePreset & {
  selectable: boolean;
  order: number;
};

const systemNarrativeStyleRegistry = new Map<TavernSystemNarrativePresetId, TavernSystemNarrativeStyleRegistryEntry>();

const toSystemNarrativePreset = (entry: TavernSystemNarrativeStyleRegistryEntry): TavernSystemNarrativePreset => ({
  id: entry.id,
  label: entry.label,
  description: entry.description,
  bridgeAddendum: entry.bridgeAddendum,
  directorAddendum: entry.directorAddendum,
  characterRules: {
    narrativeBeat: [...entry.characterRules.narrativeBeat],
    dialogueImmersive: [...entry.characterRules.dialogueImmersive],
    dialoguePlain: [...entry.characterRules.dialoguePlain],
  },
});

const getOrderedSystemNarrativeStyleEntries = () =>
  Array.from(systemNarrativeStyleRegistry.values()).sort(
    (left, right) => left.order - right.order || left.label.localeCompare(right.label),
  );

export const registerTavernSystemNarrativeStyle = (style: TavernSystemNarrativeStyleRegistration) => {
  if (systemNarrativeStyleRegistry.has(style.id)) {
    throw new Error(`Duplicate tavern system narrative style id: ${style.id}`);
  }

  systemNarrativeStyleRegistry.set(style.id, {
    ...style,
    selectable: style.selectable !== false,
    order: style.order ?? systemNarrativeStyleRegistry.size * 10,
  });
};

export const registerTavernSystemNarrativeStyles = (styles: TavernSystemNarrativeStyleRegistration[]) => {
  styles.forEach(registerTavernSystemNarrativeStyle);
};

export const getRegisteredTavernSystemNarrativeStyles = () =>
  getOrderedSystemNarrativeStyleEntries().map(toSystemNarrativePreset);

export const getSelectableTavernSystemNarrativeStyles = () =>
  getOrderedSystemNarrativeStyleEntries()
    .filter((entry) => entry.selectable)
    .map(toSystemNarrativePreset);

export type { TavernSystemNarrativePresetSettings };
