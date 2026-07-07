import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets";
import type { TavernQualityRuleId } from "@/features/pages/taverns/tavern/prompt-registry/rule-layers/types";

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
  profileVersion: 1;
  lockedAt?: number;
  lockedSceneId?: string;
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
  version: 1;
  blocks: TavernPromptBlock[];
};

export type TavernScenePromptOverrides = {
  version: 1;
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

export type TavernRoomCharacterConfig = {
  characterId: string;
  memory?: string;
};

export type TavernRelationshipTarget = { type: "user" } | { type: "character"; characterId: string };

export type TavernCharacterRelationship = {
  id: string;
  target: TavernRelationshipTarget;
  label?: string;
  attitude?: string;
  publicNote?: string;
  privateNote?: string;
  tags: string[];
  updatedAt: number;
};

export type TavernSceneRelationshipOverride = {
  id: string;
  subjectCharacterId: string;
  target: TavernRelationshipTarget;
  label?: string;
  publicNote?: string;
  privateNote?: string;
  tags: string[];
  updatedAt: number;
};

export type TavernCharacter = {
  id: string;
  systemPresetId?: string;
  systemPresetCharacterId?: string;
  systemPresetVersion?: number;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships: TavernCharacterRelationship[];
  createdAt: number;
  updatedAt: number;
};

export type TavernDirectorSpeechBias = "very_low" | "low" | "balanced" | "high" | "very_high";

export type TavernDirectorReplyModePreference = "speech" | "nonverbal" | "ambient";

export type TavernDirectorCharacterProfile = {
  characterId: string;
  temperament?: string;
  speechBias: TavernDirectorSpeechBias;
  nonverbalBias?: TavernDirectorSpeechBias;
  interestTags: string[];
  goalTags: string[];
  knowledgeTags: string[];
  conflictStyle?: string;
  socialStrategy?: string;
  speechTriggers: string[];
  silenceTriggers: string[];
  notes?: string;
};

export type TavernDirectorProfile = {
  version: 1;
  source: "system" | "preset" | "generated" | "manual";
  globalGoals: string[];
  globalRules: string[];
  characterProfiles: Record<string, TavernDirectorCharacterProfile>;
  updatedAt?: number;
};

export type TavernSchedulingSignal = {
  characterId: string;
  score: number;
  reasons: string[];
  suggestedModes: TavernDirectorReplyModePreference[];
  matchedRuleIds: string[];
};

export type TavernLorebookEntry = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  enabled: boolean;
  alwaysOn: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TavernRoomSettings = {
  immersiveDescriptionEnabled: boolean;
  directorMaxSpeakers: number;
  directorLoop: {
    enabled: boolean;
    maxRounds: number;
  };
  interactionQualityRuleIds: TavernQualityRuleId[];
  directorNarrativeControl: {
    agencyMode: "player_protagonist" | "story_directive" | "scene_drive";
    responseScale: "focused" | "balanced" | "ensemble";
    narratorPressure: "low" | "balanced" | "high";
    eventInterruption: "off" | "auto" | "forceOnStall";
    userActionConsequence: "light" | "visible" | "strict";
    mainHook: "off" | "auto" | "forceOnStall";
    qnaBreak: "off" | "auto" | "aggressive";
  };
  directorScheduling: {
    targetedReplyPolicy: "director" | "prefer" | "include" | "exclusive";
    maxExtraSpeakersOnTargetedReply: number;
    allowDirectorOnly: boolean;
    speakerMotivation: {
      enabled: boolean;
      maxMotivatedSpeakers: number;
      rules: Array<{
        id: string;
        label: string;
        when: string;
        priority: number;
        instruction: string;
      }>;
    };
    profile?: TavernDirectorProfile;
    fixedOrder: {
      enabled: boolean;
      stopAfterRound: boolean;
      includeUser: boolean;
      userPosition: "first" | "last";
    };
    instruction: string;
  };
};

export type TavernSceneStatus = {
  location?: string;
  timeLabel?: string;
  weather?: string;
  atmosphere?: string;
  scenePhase?: string;
  immediateThreat?: string;
  updatedAt: number;
};

export type TavernCharacterPublicStatus = {
  characterId: string;
  location?: string;
  posture?: string;
  visibleMood?: string;
  outfit?: string;
  visibleInjury?: string;
  holding?: string[];
  publicGoal?: string;
  updatedAt: number;
};

export type TavernCharacterPrivateStatus = {
  characterId: string;
  privateMood?: string;
  suspicion?: string;
  hiddenGoal?: string;
  privateKnowledge?: string[];
  relationshipNotes?: Record<string, string>;
  updatedAt: number;
};

export type TavernPendingInteraction = {
  id: string;
  sourceMessageId: string;
  source: {
    type: "user" | "character";
    characterId?: string;
  };
  target: {
    type: "user" | "character" | "group" | "unknown";
    characterIds?: string[];
  };
  kind: "question" | "request" | "challenge" | "invitation" | "answer";
  text: string;
  requiresResponse: boolean;
  status: "open" | "answered" | "expired";
  createdTurnId: string;
};

export type TavernReplyOption = {
  id: string;
  text: string;
  respondsToInteractionId?: string;
  targetCharacterIds: string[];
  intent: "answer" | "ask" | "act" | "interrupt" | "wait" | "inspect";
};

export type TavernRoom = {
  id: string;
  workspaceId: string;
  systemPresetId?: string;
  systemPresetVersion?: number;
  locked: boolean;
  title: string;
  presentation: TavernPresentationSettings;
  prompt: TavernRoomPromptSettings;
  creationSource?: "manual" | "quick" | "imported" | "agent_generated";
  scenePresetId: VisualPresetId;
  replyMode: TavernReplyMode;
  settings: TavernRoomSettings;
  createdAt: number;
  updatedAt: number;
};
