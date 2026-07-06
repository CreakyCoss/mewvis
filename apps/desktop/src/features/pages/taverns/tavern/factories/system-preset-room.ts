import { DEFAULT_TAVERN_RULE_COMPOSITION_ID } from "../prompt-registry/rule-layers/resolver";
import { DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID } from "../prompt-registry/system-narrative-styles";
import { createDefaultTavernPromptSettings } from "../prompt-registry/text-blocks";
import { normalizeTavernPromptStyleId } from "../presentation/prompt-styles";
import { normalizeRoomPresentation } from "../presentation/presentation-settings";
import { normalizeReplyMode } from "../normalizers/reply-mode";
import { normalizeRoomSettings } from "../normalizers/room-settings";
import { normalizeVisualPresetId } from "../visual-presets";
import { createTavernId as createId, now } from "../ids";
import { getTavernSystemPreset } from "../system-preset-registry";
import {
  normalizeProgressTracker,
  normalizeProgressViews,
  normalizeSceneOutcomes,
  normalizeStatusDefinitions,
  normalizeStatusRules,
  normalizeTaskDefinitions,
} from "../normalizers/status-normalizers";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";

export const createTavernRoomFromSystemPreset = (
  workspaceId: string,
  presetId: string,
  options: {
    roomId?: string;
    storyId?: string;
    roomCreatedAt?: number;
    createdAt?: number;
    characterIdByPresetId?: Map<string, string>;
    markAsSystemPreset?: boolean;
  } = {},
) => {
  const preset = getTavernSystemPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown tavern system preset: ${presetId}`);
  }

  const createdAt = options.createdAt ?? now();
  const roomId = options.roomId ?? createId("room");
  const markAsSystemPreset = options.markAsSystemPreset !== false;
  const presentation = normalizeRoomPresentation({
    presentation: preset.room.presentation,
    presentationProfileId: preset.room.presentationProfileId,
  });

  const room: TavernRoom = {
    id: roomId,
    workspaceId,
    ...(markAsSystemPreset
      ? {
          systemPresetId: preset.id,
          systemPresetVersion: preset.version,
        }
      : {}),
    locked: false,
    title: preset.room.title.trim(),
    presentation,
    prompt: createDefaultTavernPromptSettings({
      presentationProfileId: presentation.profileId,
      promptStyleId: normalizeTavernPromptStyleId(preset.room.promptStyleId),
      systemNarrativePresetId: DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
      ruleCompositionId: DEFAULT_TAVERN_RULE_COMPOSITION_ID,
      immersiveDescriptionEnabled: true,
    }),
    creationSource: markAsSystemPreset ? "imported" : "manual",
    scenePresetId: normalizeVisualPresetId(preset.room.scenePresetId),
    statusDefinitions: normalizeStatusDefinitions(preset.room.statusDefinitions),
    statusRules: normalizeStatusRules(preset.room.statusRules),
    progressViews: normalizeProgressViews(preset.room.progressViews),
    progressTracker: normalizeProgressTracker(preset.room.progressTracker),
    taskDefinitions: normalizeTaskDefinitions(preset.room.taskDefinitions),
    sceneOutcomes: normalizeSceneOutcomes(preset.room.sceneOutcomes),
    replyMode: normalizeReplyMode(preset.room.replyMode),
    settings: normalizeRoomSettings(preset.room.settings),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  };

  return {
    preset,
    room,
    characters: [],
    messages: [],
  };
};
