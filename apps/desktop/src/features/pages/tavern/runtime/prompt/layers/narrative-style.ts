import {
  formatTavernSystemNarrativeCharacterRules,
  formatTavernSystemNarrativePresetForPrompt,
  type TavernSystemNarrativePreset,
} from "../../../prompt-registry/system-narrative-styles";
import type { TavernSystemNarrativePresetSettings } from "../../../types";
import type { TavernPromptSection } from "../shared/sections";

export const buildSystemNarrativePresetSection = ({
  settings,
  preset,
  target,
  publicContentTag,
  usesNarrativeBeat,
  immersiveDescriptionEnabled,
}: {
  settings: TavernSystemNarrativePresetSettings;
  preset: TavernSystemNarrativePreset;
  target: "bridge" | "character";
  publicContentTag?: string;
  usesNarrativeBeat?: boolean;
  immersiveDescriptionEnabled?: boolean;
}): TavernPromptSection => ({
  id: "system-narrative-preset",
  layer: "system",
  tag: "system_narrative_preset",
  attributes: {
    id: preset.id,
    label: preset.label,
    target,
  },
  content: target === "character"
    ? [
        formatTavernSystemNarrativePresetForPrompt({
          settings,
          preset,
          target,
        }),
        ...formatTavernSystemNarrativeCharacterRules({
          preset,
          publicContentTag: publicContentTag ?? "reply",
          usesNarrativeBeat: usesNarrativeBeat ?? false,
          immersiveDescriptionEnabled: immersiveDescriptionEnabled ?? true,
        }),
      ]
    : formatTavernSystemNarrativePresetForPrompt({
        settings,
        preset,
        target,
      }),
});
