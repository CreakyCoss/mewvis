import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets/types";
import { createTimestampId } from "@/utils/ids";

export type TavernReplyMode = "director";

export type TavernPresentationProfileId = "dialogue-chat" | "third-person-prose" | "novel-prose";

export type TavernPresentationRenderStyle = "chat" | "prose";

export type TavernPresentationPerspective = "dialogue" | "third_person_limited" | "third_person_omniscient";

export type TavernPresentationDialoguePolicy = "direct" | "indirect" | "mixed";

export type TavernPresentationUserInputMode = "speech" | "intent" | "story_directive";

export type TavernPresentationGenerationContract = "character_reply_xml" | "character_narrative_beat";

export type TavernSystemNarrativePresetId = "balanced" | "restrained" | "dramatic";

export type TavernSystemNarrativePresetSettings = {
  presetId: TavernSystemNarrativePresetId;
  customInstructions?: string;
};

export type TavernPresentationProfile = {
  id: TavernPresentationProfileId;
  label: string;
  description: string;
  perspective: TavernPresentationPerspective;
  dialoguePolicy: TavernPresentationDialoguePolicy;
  userInputMode: TavernPresentationUserInputMode;
  renderStyle: TavernPresentationRenderStyle;
  generationContract: TavernPresentationGenerationContract;
  bridgeSystemAddendum: string;
  directorAddendum: string;
  characterAddendum: string;
  composerPlaceholder: string;
};

export type TavernPresentationSettings = {
  profileId: TavernPresentationProfileId;
};

export type TavernPromptBlockTarget = "bridge" | "director" | "character";

export type TavernPromptBlockSourceType =
  | "system_narrative"
  | "room_style"
  | "platform_style"
  | "quality_rule"
  | "narrative_style"
  | "genre_rule"
  | "hook_rule"
  | "taboo_rule"
  | "custom";

export type TavernPromptBlock = {
  id: string;
  target: TavernPromptBlockTarget;
  label: string;
  text: string;
  enabled: boolean;
  order: number;
  source?: {
    type: TavernPromptBlockSourceType;
    id: string;
    label: string;
  };
};

export type TavernRoomPromptSettings = {
  blocks: TavernPromptBlock[];
};

export type TavernPromptStyleId = "silent-law" | "novel" | "wuxia" | "light-novel" | "dramatic" | "grounded";

export type TavernPromptStylePreset = {
  id: TavernPromptStyleId;
  label: string;
  description: string;
  bridgeSystemAddendum: string;
  directorAddendum: string;
  characterAddendum: string;
};

export type TavernRoomSettings = {
  immersiveDescriptionEnabled: boolean;
  directorMaxSpeakers: number;
  directorLoop: {
    maxRounds: number;
  };
  directorNarrativeControl: {
    agencyMode: "player_protagonist" | "story_directive" | "scene_drive";
    responseScale: "focused" | "balanced" | "ensemble";
    narratorPressure: "low" | "balanced" | "high";
  };
};

export type TavernRoomConfig = {
  id: string;
  title: string;
  presentation: TavernPresentationSettings;
  prompt: TavernRoomPromptSettings;
  scenePresetId: VisualPresetId;
  replyMode: TavernReplyMode;
  settings: TavernRoomSettings;
};

export const createEmptyManualTavernRoom = (index: number): TavernRoomConfig => ({
  id: createTimestampId("room"),
  title: `新酒馆 ${index}`,
  scenePresetId: "general",
  presentation: {
    profileId: "dialogue-chat",
  },
  prompt: {
    blocks: [],
  },
  replyMode: "director",
  settings: {
    immersiveDescriptionEnabled: true,
    directorMaxSpeakers: 3,
    directorLoop: {
      maxRounds: 2,
    },
    directorNarrativeControl: {
      agencyMode: "player_protagonist",
      responseScale: "balanced",
      narratorPressure: "balanced",
    },
  },
});
