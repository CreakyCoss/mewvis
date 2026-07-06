import {
  DEFAULT_TAVERN_ROOM_SETTINGS,
} from "../defaults";
import {
  DEFAULT_TAVERN_PROMPT_STYLE_ID,
} from "./prompt-styles";
import {
  DEFAULT_TAVERN_RULE_COMPOSITION_ID,
} from "../prompt-registry/rule-layers/resolver";
import {
  normalizeTavernPresentation,
} from "../prompt-registry/presentation-rules";
import {
  DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
} from "../prompt-registry/system-narrative-styles";
import {
  createDefaultTavernPromptSettings,
} from "../prompt-registry/text-blocks";
import type {
  TavernPresentationSettings,
} from "../types";

export const createDefaultPromptForPresentation = (
  presentation: TavernPresentationSettings,
) => createDefaultTavernPromptSettings({
  presentationProfileId: presentation.profileId,
  promptStyleId: DEFAULT_TAVERN_PROMPT_STYLE_ID,
  systemNarrativePresetId: DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  ruleCompositionId: DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  immersiveDescriptionEnabled: DEFAULT_TAVERN_ROOM_SETTINGS.immersiveDescriptionEnabled,
});

export const normalizeRoomPresentation = ({
  presentation,
  presentationProfileId,
}: {
  presentation?: unknown;
  presentationProfileId?: unknown;
}) => normalizeTavernPresentation(
  presentation ?? (presentationProfileId ? { profileId: presentationProfileId } : undefined),
);
