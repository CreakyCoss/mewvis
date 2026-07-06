import systemPresetData from "./system-presets/default-taverns.json";
import type {
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernCharacterRelationship,
  TavernMessage,
  TavernPresentationSettings,
  TavernProgressTrackerSettings,
  TavernProgressView,
  TavernReplyMode,
  TavernRoomSettings,
  TavernSceneOutcomeDefinition,
  TavernSceneRelationshipOverride,
  TavernSceneStatus,
  TavernStatusDefinition,
  TavernStatusRule,
  TavernStatusSnapshot,
  TavernTaskDefinition,
} from "./types";

export type TavernSystemPresetCharacter = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
};

export type TavernSystemPresetMessage = {
  role: TavernMessage["role"];
  characterId?: string;
  content: string;
};

export type TavernSystemPresetScene = {
  title?: string;
  order?: number;
  scenePresetId?: unknown;
  scene?: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
    sceneMemories?: Array<{
      note: string;
      visibility?: unknown;
      secretId?: string;
    }>;
    characterMemories?: Array<{
      characterId: string;
      note: string;
      visibility?: unknown;
      secretId?: string;
      revealToCharacterIds?: string[];
    }>;
    lorebookEntries?: Array<{
      title: string;
      content: string;
      keywords?: string[];
      alwaysOn?: boolean;
    }>;
  }>;
  characterIds?: string[];
  activeCharacterId?: string;
};

export type TavernSystemPresetRoom = {
  title: string;
  presentation?: Partial<TavernPresentationSettings> & {
    profileId?: unknown;
  };
  presentationProfileId?: unknown;
  promptStyleId?: unknown;
  storyOutline?: string;
  storyGoal?: string;
  scenePresetId?: unknown;
  scene: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusDefinitions?: TavernStatusDefinition[];
  statusRules?: TavernStatusRule[];
  progressViews?: TavernProgressView[];
  progressTracker?: Partial<TavernProgressTrackerSettings>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  scenes?: TavernSystemPresetScene[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
    sceneMemories?: Array<{
      note: string;
      visibility?: unknown;
      secretId?: string;
    }>;
    characterMemories?: Array<{
      characterId: string;
      note: string;
      visibility?: unknown;
      secretId?: string;
      revealToCharacterIds?: string[];
    }>;
    lorebookEntries?: Array<{
      title: string;
      content: string;
      keywords?: string[];
      alwaysOn?: boolean;
    }>;
  }>;
  characterIds: string[];
  activeCharacterId: string;
  replyMode?: TavernReplyMode;
  userPersonaName?: string;
  settings?: Partial<TavernRoomSettings>;
};

export type TavernSystemPreset = {
  id: string;
  version: number;
  label: string;
  description: string;
  characters: TavernSystemPresetCharacter[];
  room: TavernSystemPresetRoom;
  messages: TavernSystemPresetMessage[];
};

type TavernSystemPresetCollection = {
  version: 2;
  presets: TavernSystemPreset[];
};

const tavernSystemPresetCollection = systemPresetData as unknown as TavernSystemPresetCollection;

export const tavernSystemPresets = tavernSystemPresetCollection.presets;

const tavernSystemPresetById = new Map(
  tavernSystemPresets.map((preset) => [preset.id, preset]),
);

export const getTavernSystemPreset = (presetId: string | null | undefined) =>
  tavernSystemPresetById.get(presetId ?? "") ?? null;

export const normalizeSystemPresetId = (presetId: unknown) => {
  if (typeof presetId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.id;
};

export const normalizeSystemPresetCharacterId = (
  presetId: string | undefined,
  characterId: unknown,
) => {
  if (!presetId || typeof characterId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.characters.some((character) =>
    character.id === characterId
  )
    ? characterId
    : undefined;
};
