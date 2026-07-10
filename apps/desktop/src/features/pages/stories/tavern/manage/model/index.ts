import type { VisualPresetId } from "@/features/pages/stories/tavern/presets/visual-presets/types";
import { createTimestampId } from "@/utils/ids";

export type TavernReplyMode = "director";

export type TavernPresentationProfileId = "dialogue-chat" | "third-person-prose" | "novel-prose";

export type TavernPresentationRenderStyle = "chat" | "prose";

export type TavernPresentationPerspective = "dialogue" | "third_person_limited" | "third_person_omniscient";

export type TavernPresentationDialoguePolicy = "direct" | "indirect" | "mixed";

export type TavernPresentationUserInputMode = "speech" | "intent" | "story_directive";

export type TavernPresentationGenerationContract = "character_reply_xml" | "character_narrative_beat";

export type TavernSystemNarrativeStyleId = "balanced" | "restrained" | "dramatic";

export type TavernSystemNarrativeSettings = {
  styleId: TavernSystemNarrativeStyleId;
  customInstructions?: string;
};

export type TavernRoomStyleId = "silent-law" | "novel" | "wuxia" | "light-novel" | "dramatic" | "grounded";

export type TavernPresentationProfile = {
  id: TavernPresentationProfileId;
  label: string;
  description: string;
  perspective: TavernPresentationPerspective;
  dialoguePolicy: TavernPresentationDialoguePolicy;
  userInputMode: TavernPresentationUserInputMode;
  renderStyle: TavernPresentationRenderStyle;
  generationContract: TavernPresentationGenerationContract;
  directorAddendum: string;
  characterAddendum: string;
  composerPlaceholder: string;
};

export type TavernPresentationSettings = {
  profileId: TavernPresentationProfileId;
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
  systemNarrative: TavernSystemNarrativeSettings;
  roomStyleId: TavernRoomStyleId;
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
  systemNarrative: {
    styleId: "balanced",
    customInstructions: "",
  },
  roomStyleId: "novel",
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
