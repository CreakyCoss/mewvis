import systemPresetData from "./system-presets/default-taverns.json";
import type { TavernMessage } from "./types";
import type {
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernCharacterRelationship,
  TavernPresentationSettings,
  TavernReplyMode,
  TavernRoomSettings,
  TavernSceneRelationshipOverride,
  TavernSceneStatus,
} from "@/features/pages/taverns/manage/model";

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
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
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
  scenes?: TavernSystemPresetScene[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
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

const tavernSystemPresetById = new Map(tavernSystemPresets.map((preset) => [preset.id, preset]));

export const getTavernSystemPreset = (presetId: string | null | undefined) =>
  tavernSystemPresetById.get(presetId ?? "") ?? null;

export const normalizeSystemPresetId = (presetId: unknown) => {
  if (typeof presetId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.id;
};
