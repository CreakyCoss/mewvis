import {
  DEFAULT_VISUAL_PRESET_ID,
} from "@/features/pages/tavern/visual-presets";
import {
  projectTavernSceneOntoRoom,
} from "../runtime/active-scene-runtime";
import {
  projectTavernSceneFieldsOntoRoom,
} from "../runtime/scene-field-projection";
import {
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
} from "../defaults";
import {
  createTavernId as createId,
  now,
} from "../ids";
import {
  createDefaultPromptForPresentation,
} from "../presentation/presentation-settings";
import {
  createDefaultTavernPresentation,
} from "../prompt-registry/presentation-rules";
import {
  normalizeCharacterRelationships,
} from "../normalizers/relationships";
import {
  cloneDefaultRoomSettings,
} from "../normalizers/room-settings";
import {
  buildTavernScene,
  defaultSceneTitle,
} from "../story-model/scene-builder";
import {
  createDefaultStoryGraph,
} from "../story-model/story-graph";
import {
  createTavernStoryBinding,
} from "../story-model/story-binding";
import type {
  TavernCharacter,
  TavernCharacterRelationship,
  TavernRoom,
} from "../types";

export const createTavernRoom = (workspaceId: string, index: number): TavernRoom => {
  const createdAt = now();
  const roomId = createId("room");
  const scene = buildTavernScene({
    title: defaultSceneTitle,
    scenePresetId: DEFAULT_VISUAL_PRESET_ID,
    scene: "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    createdAt,
    updatedAt: createdAt,
  });
  const storyGraph = createDefaultStoryGraph([scene]);
  const presentation = createDefaultTavernPresentation();
  const roomIdentity = {
    id: roomId,
    workspaceId,
    locked: false,
    title: `新酒馆 ${index}`,
    creationSource: "manual" as const,
  };
  const roomStory = {
    storyBinding: createTavernStoryBinding(roomId, createdAt),
    storyOutline: "",
    storyGoal: "",
    storyGraph,
    storyRuns: [],
    activeRunId: undefined,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    activeSceneId: scene.id,
    scenes: [scene],
  };
  const roomProgressDefaults = {
    statusDefinitions: [...DEFAULT_TAVERN_STATUS_DEFINITIONS],
    statusRules: [...DEFAULT_TAVERN_STATUS_RULES],
    progressViews: [...DEFAULT_TAVERN_PROGRESS_VIEWS],
    progressTracker: { ...DEFAULT_TAVERN_PROGRESS_TRACKER },
  };
  const emptyRoomContent = {
    localCharacters: [],
    lorebookEntries: [],
    characterConfigs: {},
    characterMemories: {},
    characterIds: [],
    activeCharacterId: "",
    assetDrafts: [],
  };

  return projectTavernSceneOntoRoom({
    ...roomIdentity,
    presentation,
    prompt: createDefaultPromptForPresentation(presentation),
    ...roomStory,
    ...projectTavernSceneFieldsOntoRoom(scene),
    ...roomProgressDefaults,
    ...emptyRoomContent,
    replyMode: "director",
    userPersonaName: "我",
    settings: cloneDefaultRoomSettings(),
    createdAt,
    updatedAt: createdAt,
  });
};

export const createTavernCharacter = (input: {
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
}): TavernCharacter => {
  const createdAt = now();
  return {
    id: createId("character"),
    name: input.name,
    avatar: input.avatar,
    description: input.description,
    speakingStyle: input.speakingStyle,
    writingStyle: input.writingStyle?.trim() || undefined,
    replyStylePrompt: input.replyStylePrompt?.trim() || undefined,
    goals: input.goals?.trim() || undefined,
    relationships: normalizeCharacterRelationships(input.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};
