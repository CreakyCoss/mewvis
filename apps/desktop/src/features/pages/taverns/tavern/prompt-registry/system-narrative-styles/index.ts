import type {
  TavernSystemNarrativePresetId,
  TavernSystemNarrativePresetSettings,
} from "@/features/pages/taverns/manage/model";
import {
  getRegisteredTavernSystemNarrativeStyles,
  getSelectableTavernSystemNarrativeStyles,
  registerTavernSystemNarrativeStyles,
} from "./registry";
import { balancedSystemNarrativeStyle } from "./styles/balanced";
import { dramaticSystemNarrativeStyle } from "./styles/dramatic";
import { restrainedSystemNarrativeStyle } from "./styles/restrained";

export {
  getRegisteredTavernSystemNarrativeStyles,
  getSelectableTavernSystemNarrativeStyles,
  registerTavernSystemNarrativeStyle,
  registerTavernSystemNarrativeStyles,
} from "./registry";
export type {
  TavernSystemNarrativePreset,
  TavernSystemNarrativeRuleSet,
  TavernSystemNarrativeStyleRegistration,
} from "./registry";

export const DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID: TavernSystemNarrativePresetId = "balanced";

registerTavernSystemNarrativeStyles([
  balancedSystemNarrativeStyle,
  restrainedSystemNarrativeStyle,
  dramaticSystemNarrativeStyle,
]);

export const TAVERN_SYSTEM_NARRATIVE_PRESETS = getRegisteredTavernSystemNarrativeStyles();
export const TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS = getSelectableTavernSystemNarrativeStyles();

const tavernSystemNarrativePresetIds = new Set(TAVERN_SYSTEM_NARRATIVE_PRESETS.map((preset) => preset.id));

const withPublicContentTag = (rules: string[], publicContentTag: string) =>
  rules.map((rule) => rule.split("{publicContentTag}").join(publicContentTag));

export const normalizeTavernSystemNarrativePresetId = (value: unknown): TavernSystemNarrativePresetId =>
  typeof value === "string" && tavernSystemNarrativePresetIds.has(value as TavernSystemNarrativePresetId)
    ? (value as TavernSystemNarrativePresetId)
    : DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID;

export const normalizeTavernSystemNarrativePresetSettings = (value: unknown): TavernSystemNarrativePresetSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<TavernSystemNarrativePresetSettings>) : {};

  return {
    presetId: normalizeTavernSystemNarrativePresetId(candidate.presetId),
    customInstructions:
      typeof candidate.customInstructions === "string" && candidate.customInstructions.trim()
        ? candidate.customInstructions.trim().slice(0, 2000)
        : undefined,
  };
};

export const getTavernSystemNarrativePreset = (value: unknown) => {
  const id = normalizeTavernSystemNarrativePresetId(value);
  return TAVERN_SYSTEM_NARRATIVE_PRESETS.find((preset) => preset.id === id) ?? TAVERN_SYSTEM_NARRATIVE_PRESETS[0];
};

export const resolveTavernSystemNarrativePreset = (settings: unknown) => {
  const normalizedSettings = normalizeTavernSystemNarrativePresetSettings(settings);
  return {
    settings: normalizedSettings,
    preset: getTavernSystemNarrativePreset(normalizedSettings.presetId),
  };
};

export const formatTavernSystemNarrativeCharacterRules = ({
  preset,
  publicContentTag,
  usesNarrativeBeat,
  immersiveDescriptionEnabled,
}: {
  preset: ReturnType<typeof getTavernSystemNarrativePreset>;
  publicContentTag: string;
  usesNarrativeBeat: boolean;
  immersiveDescriptionEnabled: boolean;
}) => {
  if (usesNarrativeBeat) {
    return withPublicContentTag(preset.characterRules.narrativeBeat, publicContentTag);
  }

  if (immersiveDescriptionEnabled) {
    return withPublicContentTag(preset.characterRules.dialogueImmersive, publicContentTag);
  }

  return withPublicContentTag(preset.characterRules.dialoguePlain, publicContentTag);
};

export const formatTavernSystemNarrativePresetForPrompt = ({
  settings,
  preset,
  target,
}: {
  settings: TavernSystemNarrativePresetSettings;
  preset: ReturnType<typeof getTavernSystemNarrativePreset>;
  target: "bridge" | "director" | "character";
}) =>
  [
    `预设：${preset.label}。${preset.description}`,
    target === "bridge" ? preset.bridgeAddendum : "",
    target === "director" ? preset.directorAddendum : "",
    settings.customInstructions ? `房间自定义系统叙事规则：${settings.customInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
