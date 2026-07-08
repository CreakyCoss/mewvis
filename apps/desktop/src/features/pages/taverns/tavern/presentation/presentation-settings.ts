import { DEFAULT_TAVERN_PROMPT_STYLE_ID } from "./prompt-styles";
import { DEFAULT_TAVERN_RULE_COMPOSITION_ID } from "../prompt-registry/rule-layers/resolver";
import { normalizeTavernPresentation } from "../prompt-registry/presentation-rules";
import { DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID } from "../prompt-registry/system-narrative-styles";
import { createDefaultTavernPromptSettings } from "../prompt-registry/text-blocks";
import type { TavernPresentationSettings, TavernRoomSettings } from "@/features/pages/taverns/manage/model";

export const createDefaultPromptForPresentation = (
  presentation: TavernPresentationSettings,
  settings?: Pick<TavernRoomSettings, "immersiveDescriptionEnabled">,
) =>
  createDefaultTavernPromptSettings({
    presentationProfileId: presentation.profileId,
    promptStyleId: DEFAULT_TAVERN_PROMPT_STYLE_ID,
    systemNarrativePresetId: DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
    ruleCompositionId: DEFAULT_TAVERN_RULE_COMPOSITION_ID,
    immersiveDescriptionEnabled: settings?.immersiveDescriptionEnabled !== false,
  });

export const normalizeRoomPresentation = ({
  presentation,
  presentationProfileId,
}: {
  presentation?: unknown;
  presentationProfileId?: unknown;
}) =>
  normalizeTavernPresentation(
    presentation ?? (presentationProfileId ? { profileId: presentationProfileId } : undefined),
  );
