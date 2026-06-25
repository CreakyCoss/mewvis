import {
  assertStoryImportDraftReady,
  createStoryImportDraft,
  type StoryAsset,
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
): Partial<StoryImportDraftScene> => ({
  id: trimText(scene.id) || `scene-${index + 1}`,
  title: trimText(scene.title) || `场景 ${index + 1}`,
  scene: trimText(scene.scene),
  goal: trimText(scene.sceneGoal),
  plot: trimText(scene.plot),
  direction: trimText(scene.storyDirection),
  transition: trimText(scene.transition),
  memory: trimText(scene.memory),
  characterIds: Array.isArray(scene.characterIds) ? scene.characterIds : [],
  activeCharacterId: trimText(scene.activeCharacterId) || undefined,
  lorebookEntries: (scene.lorebookEntries ?? []).map(mapLorebookEntryToDraft),
  extra: compactObject({
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
  }),
});

const firstSceneFromRoom = (
  room: TavernGeneratedPresetRoom,
): TavernGeneratedPresetScene => ({
  title: "默认场景",
  scenePresetId: room.scenePresetId,
  scene: room.scene,
  sceneGoal: room.sceneGoal,
  plot: room.plot,
  storyDirection: room.storyDirection,
  transition: room.transition,
  memory: room.memory,
  relationshipOverrides: room.relationshipOverrides,
  sceneStatus: room.sceneStatus,
  characterPublicStatuses: room.characterPublicStatuses,
  characterPrivateStatuses: room.characterPrivateStatuses,
  statusSnapshot: room.statusSnapshot,
  factEvents: room.factEvents,
  taskDefinitions: room.taskDefinitions,
  sceneOutcomes: room.sceneOutcomes,
  characterMemories: room.characterMemories,
  lorebookEntries: room.lorebookEntries,
  characterIds: room.characterIds,
  activeCharacterId: room.activeCharacterId,
});

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

const mapDraftLorebookEntryToTavern = (
  entry: StoryImportDraftLorebookEntry,
) => ({
  title: entry.title,
  content: entry.content,
  keywords: entry.keywords,
  enabled: entry.enabled,
  alwaysOn: entry.alwaysOn,
});

const mapDraftCharacterToTavern = (
  character: StoryImportDraftCharacter,
): TavernGeneratedPresetCharacter => ({
  id: character.id,
  name: character.name,
  avatar: character.avatar,
  description: character.description,
  speakingStyle: character.speakingStyle,
  writingStyle: character.writingStyle,
  replyStylePrompt: character.replyStylePrompt,
  goals: character.goals,
  relationships: character.relationships as TavernGeneratedPresetCharacter["relationships"],
  memory: character.memory,
  publicStatus: character.extra?.publicStatus as TavernGeneratedPresetCharacter["publicStatus"],
  privateStatus: character.extra?.privateStatus as TavernGeneratedPresetCharacter["privateStatus"],
});

const mapDraftSceneToTavern = (
  scene: StoryImportDraftScene,
): TavernGeneratedPresetScene => ({
  id: scene.id,
  title: scene.title,
  scene: scene.scene,
  sceneGoal: scene.goal,
  plot: scene.plot,
  storyDirection: scene.direction,
  transition: scene.transition,
  memory: scene.memory,
  characterIds: scene.characterIds,
  activeCharacterId: scene.activeCharacterId,
  lorebookEntries: scene.lorebookEntries.map(mapDraftLorebookEntryToTavern),
  scenePresetId: scene.extra?.scenePresetId,
  relationshipOverrides: scene.extra?.relationshipOverrides as TavernGeneratedPresetScene["relationshipOverrides"],
  sceneStatus: scene.extra?.sceneStatus as TavernGeneratedPresetScene["sceneStatus"],
  characterPublicStatuses: scene.extra?.characterPublicStatuses as TavernGeneratedPresetScene["characterPublicStatuses"],
  characterPrivateStatuses: scene.extra?.characterPrivateStatuses as TavernGeneratedPresetScene["characterPrivateStatuses"],
  statusSnapshot: scene.extra?.statusSnapshot as TavernGeneratedPresetScene["statusSnapshot"],
  factEvents: scene.extra?.factEvents as TavernGeneratedPresetScene["factEvents"],
  taskDefinitions: scene.extra?.taskDefinitions as TavernGeneratedPresetScene["taskDefinitions"],
  sceneOutcomes: scene.extra?.sceneOutcomes as TavernGeneratedPresetScene["sceneOutcomes"],
  characterMemories: scene.extra?.characterMemories as TavernGeneratedPresetScene["characterMemories"],
});

export const createTavernGeneratedPresetFromStoryImportDraft = (
  draft: StoryImportDraft,
): TavernGeneratedPresetJson => {
  assertStoryImportDraftReady(draft);
  const tavernRoomHints = (
    draft.runtimeHints.tavernRoom && typeof draft.runtimeHints.tavernRoom === "object"
      ? draft.runtimeHints.tavernRoom
      : {}
  ) as Partial<TavernGeneratedPresetRoom>;
  const scenes = draft.scenes.map(mapDraftSceneToTavern);
  const firstScene = scenes[0];

  return {
    version: 1,
    label: draft.label,
    description: draft.description,
    room: {
      ...tavernRoomHints,
      title: draft.story.title,
      storyOutline: draft.story.outline,
      storyGoal: draft.story.goal,
      userPersonaName: draft.story.userPersonaName,
      scene: firstScene?.scene,
      sceneGoal: firstScene?.sceneGoal,
      plot: firstScene?.plot,
      storyDirection: firstScene?.storyDirection,
      transition: firstScene?.transition,
      memory: firstScene?.memory,
      lorebookEntries: draft.lorebookEntries.map(mapDraftLorebookEntryToTavern),
      scenes,
      characterIds: firstScene?.characterIds?.length
        ? firstScene.characterIds
        : draft.characters.map((character) => character.id),
      activeCharacterId: firstScene?.activeCharacterId ?? draft.characters[0]?.id,
    },
    characters: draft.characters.map(mapDraftCharacterToTavern),
    messages: draft.messages,
  };
};

const formatStoryCharacterMemory = (
  character: StoryAsset["characters"][number],
) => [
  character.memory?.required,
  character.memory?.public,
  character.memory?.known,
  character.memory?.privateSelf,
].map((value) => value?.trim()).filter(Boolean).join("\n\n");

export const createTavernGeneratedPresetFromStoryAsset = (
  story: StoryAsset,
): TavernGeneratedPresetJson => ({
  version: 1,
  label: story.title,
  description: story.outline,
    room: {
      title: story.title,
      storyOutline: story.outline,
      storyGoal: story.goal,
      storyGraph: {
        version: 1,
        entryNodeId: story.graph.entryNodeId,
        activeNodeId: story.graph.activeNodeId,
        stages: story.graph.stages,
        nodes: story.graph.nodes.map((node, index) => ({
          ...node,
          type: node.type === "failure" || node.type === "ending" ? node.type : "normal",
          pathRole: node.pathRole === "branch" ? "branch" : "main",
          status: node.status === "ready" || node.status === "played" ? node.status : "draft",
          position: {
            x: 120 + index * 240,
            y: 160,
          },
          createdAt: story.createdAt,
          updatedAt: story.updatedAt,
        })),
        edges: story.graph.edges.map((edge, index) => ({
          ...edge,
          createdAt: story.createdAt,
          updatedAt: story.updatedAt,
          priority: edge.priority ?? index,
        })),
      },
      userPersonaName: story.userPersonaName,
    scene: story.scenes[0]?.scene,
    sceneGoal: story.scenes[0]?.goal,
    plot: story.scenes[0]?.plot,
    storyDirection: story.scenes[0]?.direction,
    transition: story.scenes[0]?.transition,
    memory: story.scenes[0]?.memory,
    lorebookEntries: story.lorebookEntries.map(mapDraftLorebookEntryToTavern),
    scenes: story.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      scene: scene.scene,
      sceneGoal: scene.goal,
      plot: scene.plot,
      storyDirection: scene.direction,
      transition: scene.transition,
      memory: scene.memory,
      lorebookEntries: [],
      characterIds: story.characters.map((character) => character.id),
      activeCharacterId: story.characters[0]?.id,
    })),
    characterIds: story.characters.map((character) => character.id),
    activeCharacterId: story.characters[0]?.id,
  },
  characters: story.characters.map((character) => ({
    id: character.id,
    name: character.name,
    description: character.description,
    speakingStyle: character.speakingStyle,
    writingStyle: character.writingStyle,
    replyStylePrompt: character.replyStylePrompt,
    goals: character.goals,
    memory: formatStoryCharacterMemory(character),
  })),
  messages: [{
    role: "narrator",
    content: `已从故事「${story.title}」创建酒馆呈现。`,
  }],
});
