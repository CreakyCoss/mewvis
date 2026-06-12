import type { VisualPresetId } from "@/features/visual-presets";

export type TavernReplyMode = "active" | "round" | "director";

export type TavernRoomCharacterConfig = {
  characterId: string;
  memory?: string;
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
  goals?: string;
  relationships?: string;
  createdAt: number;
  updatedAt: number;
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

export type TavernTimelineEvent = {
  id: string;
  title: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernTimelineDraft = {
  id: string;
  title: string;
  summary: string;
};

export type TavernCharacterMemoryDraft = {
  id: string;
  characterId: string;
  note: string;
};

export type TavernLorebookDraft = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  alwaysOn: boolean;
};

export type TavernAssetDraft = {
  id: string;
  sourceMessageIds: string[];
  timelineEvents: TavernTimelineDraft[];
  characterMemories: TavernCharacterMemoryDraft[];
  lorebookEntries: TavernLorebookDraft[];
  createdAt: number;
  updatedAt: number;
};

export type TavernRoomSettings = {
  immersiveDescriptionEnabled: boolean;
  showExecutionTrace: boolean;
  autoAssetExtractionEnabled: boolean;
  assetExtractionIntervalTurns: number;
  maxAssetDrafts: number;
  directorMaxSpeakers: number;
};

export type TavernTimelineScope = {
  mode: "auto" | "range" | "selected";
  startEventId?: string;
  endEventId?: string;
  eventIds?: string[];
};

export type TavernScene = {
  id: string;
  order: number;
  title: string;
  scenePresetId: VisualPresetId;
  scene: string;
  sceneGoal: string;
  plot: string;
  storyDirection: string;
  transition: string;
  timelineScope: TavernTimelineScope;
  memory: string;
  autoMemory: string;
  autoMemoryUpdatedAt?: number;
  summarizedMessageIds?: string[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  assetDrafts: TavernAssetDraft[];
  characterIds: string[];
  activeCharacterId: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernRoom = {
  id: string;
  workspaceId: string;
  systemPresetId?: string;
  systemPresetVersion?: number;
  locked: boolean;
  title: string;
  storyOutline: string;
  storyGoal: string;
  activeSceneId?: string;
  scenes?: TavernScene[];
  scenePresetId: VisualPresetId;
  scene: string;
  sceneGoal: string;
  scenePlot: string;
  sceneDirection: string;
  sceneTransition: string;
  memory: string;
  autoMemory: string;
  autoMemoryUpdatedAt?: number;
  summarizedMessageIds?: string[];
  characterConfigs?: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
  localCharacters?: TavernCharacter[];
  lorebookEntries: TavernLorebookEntry[];
  timelineEvents: TavernTimelineEvent[];
  assetDrafts: TavernAssetDraft[];
  characterIds: string[];
  activeCharacterId: string;
  replyMode: TavernReplyMode;
  userPersonaName: string;
  settings: TavernRoomSettings;
  createdAt: number;
  updatedAt: number;
};

export type TavernMessage = {
  id: string;
  roomId: string;
  role: "user" | "character" | "narrator";
  characterId?: string;
  content: string;
  thought?: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

export type TavernState = {
  version: 1;
  activeRoomId: string;
  rooms: TavernRoom[];
  messagesByRoom: Record<string, TavernMessage[]>;
  messagesByScene?: Record<string, TavernMessage[]>;
};

export type TavernReferencedFile = {
  path: string;
  content: string;
};
