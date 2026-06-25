import {
  assertStoryImportDraftReady,
  createStoryImportDraft,
  type StoryImportDraft,
  type StoryImportDraftCharacter,
  type StoryImportDraftLorebookEntry,
  type StoryImportDraftScene,
} from "@/features/story";
import type {
  TavernGeneratedPresetCharacter,
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernGeneratedPresetScene,
} from "../../types";

const trimText = (value: unknown) => typeof value === "string" ? value.trim() : "";

const compactObject = (
  value: Record<string, unknown>,
) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined),
);

const mapLorebookEntryToDraft = (
  entry: NonNullable<TavernGeneratedPresetRoom["lorebookEntries"]>[number],
  index: number,
): StoryImportDraftLorebookEntry => ({
  id: `lore-${index + 1}`,
  title: trimText(entry.title) || `世界书 ${index + 1}`,
  content: trimText(entry.content),
  keywords: Array.isArray(entry.keywords)
    ? entry.keywords.flatMap((keyword: unknown) => trimText(keyword) ? [trimText(keyword)] : [])
    : [],
  enabled: "enabled" in entry ? entry.enabled !== false : true,
  alwaysOn: entry.alwaysOn === true,
});

const mapCharacterToDraft = (
  character: TavernGeneratedPresetCharacter,
  index: number,
): Partial<StoryImportDraftCharacter> => ({
  id: trimText(character.id) || `char-${index + 1}`,
  name: trimText(character.name) || `角色 ${index + 1}`,
  avatar: trimText(character.avatar),
  description: trimText(character.description),
  speakingStyle: trimText(character.speakingStyle),
  writingStyle: trimText(character.writingStyle) || undefined,
  replyStylePrompt: trimText(character.replyStylePrompt) || undefined,
  goals: trimText(character.goals) || undefined,
  memory: trimText(character.memory) || undefined,
  relationships: character.relationships,
  extra: compactObject({
    publicStatus: character.publicStatus,
    privateStatus: character.privateStatus,
  }),
});

const mapSceneToDraft = (
  scene: TavernGeneratedPresetScene,
  index: number,
): Partial<StoryImportDraftScene> => {
  const draftIdentity = {
    id: trimText(scene.id) || `scene-${index + 1}`,
    title: trimText(scene.title) || `场景 ${index + 1}`,
  };
  const draftNarrative = {
    scene: trimText(scene.scene),
    goal: trimText(scene.sceneGoal),
    plot: trimText(scene.plot),
    direction: trimText(scene.storyDirection),
    transition: trimText(scene.transition),
    memory: trimText(scene.memory),
  };
  const draftCharacterScope = {
    characterIds: Array.isArray(scene.characterIds) ? scene.characterIds : [],
    activeCharacterId: trimText(scene.activeCharacterId) || undefined,
  };
  const draftAssets = {
    lorebookEntries: (scene.lorebookEntries ?? []).map(mapLorebookEntryToDraft),
  };
  const draftExtraState = compactObject({
    scenePresetId: scene.scenePresetId,
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    statusSnapshot: scene.statusSnapshot,
    factEvents: scene.factEvents,
    taskDefinitions: scene.taskDefinitions,
    sceneOutcomes: scene.sceneOutcomes,
    characterMemories: scene.characterMemories,
  });

  return {
    ...draftIdentity,
    ...draftNarrative,
    ...draftCharacterScope,
    ...draftAssets,
    extra: draftExtraState,
  };
};

const firstSceneFromRoom = (
  room: TavernGeneratedPresetRoom,
): TavernGeneratedPresetScene => {
  const sceneNarrative = {
    scenePresetId: room.scenePresetId,
    scene: room.scene,
    sceneGoal: room.sceneGoal,
    plot: room.plot,
    storyDirection: room.storyDirection,
    transition: room.transition,
    memory: room.memory,
  };
  const sceneState = {
    relationshipOverrides: room.relationshipOverrides,
    sceneStatus: room.sceneStatus,
    characterPublicStatuses: room.characterPublicStatuses,
    characterPrivateStatuses: room.characterPrivateStatuses,
  };
  const sceneProgress = {
    statusSnapshot: room.statusSnapshot,
    factEvents: room.factEvents,
    taskDefinitions: room.taskDefinitions,
    sceneOutcomes: room.sceneOutcomes,
  };
  const sceneContent = {
    characterMemories: room.characterMemories,
    lorebookEntries: room.lorebookEntries,
    characterIds: room.characterIds,
    activeCharacterId: room.activeCharacterId,
  };

  return {
    title: "默认场景",
    ...sceneNarrative,
    ...sceneState,
    ...sceneProgress,
    ...sceneContent,
  };
};

export const createStoryImportDraftFromTavernGeneratedPreset = (
  preset: TavernGeneratedPresetJson,
  {
    sourceKind,
  }: {
    sourceKind: StoryImportDraft["sourceKind"];
  },
) => {
  const room = preset.room ?? {};
  const scenes = Array.isArray(room.scenes) && room.scenes.length > 0
    ? room.scenes
    : [firstSceneFromRoom(room)];
  const draft = createStoryImportDraft({
    mode: "story",
    sourceKind,
    label: preset.label,
    description: preset.description,
    story: {
      title: room.title,
      outline: room.storyOutline,
      goal: room.storyGoal,
      userPersonaName: room.userPersonaName,
    },
    characters: (preset.characters ?? []).map(mapCharacterToDraft),
    scenes: scenes.map(mapSceneToDraft),
    lorebookEntries: (room.lorebookEntries ?? []).map(mapLorebookEntryToDraft),
    messages: preset.messages,
    runtimeHints: {
      tavernRoom: compactObject({
        presentation: room.presentation,
        presentationProfileId: room.presentationProfileId,
        prompt: room.prompt,
        promptStyleId: room.promptStyleId,
        scenePresetId: room.scenePresetId,
        statusDefinitions: room.statusDefinitions,
        statusRules: room.statusRules,
        progressViews: room.progressViews,
        progressTracker: room.progressTracker,
        statusSnapshot: room.statusSnapshot,
        factEvents: room.factEvents,
        taskDefinitions: room.taskDefinitions,
        sceneOutcomes: room.sceneOutcomes,
        characterMemories: room.characterMemories,
        characterIds: room.characterIds,
        activeCharacterId: room.activeCharacterId,
        replyMode: room.replyMode,
        settings: room.settings,
      }),
    },
  });
  assertStoryImportDraftReady(draft);
  return draft;
};
