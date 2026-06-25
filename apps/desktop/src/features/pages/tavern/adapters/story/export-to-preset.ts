import {
  assertStoryImportDraftReady,
  resolveStoryCharacterAvatar,
  type StoryImportDraft,
  type StoryImportDraftCharacter,
  type StoryImportDraftLorebookEntry,
  type StoryImportDraftScene,
  type StoryPresentationSeed,
} from "@/features/story";
import type {
  TavernGeneratedPresetCharacter,
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernGeneratedPresetScene,
} from "../../types";

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
  avatar: resolveStoryCharacterAvatar({
    avatar: character.avatar,
    characterId: character.id,
  }),
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
  character: StoryPresentationSeed["characters"][number],
) => [
  character.memory?.required,
  character.memory?.public,
  character.memory?.known,
  character.memory?.privateSelf,
].map((value) => value?.trim()).filter(Boolean).join("\n\n");

export const createTavernGeneratedPresetFromStoryPresentationSeed = (
  seed: StoryPresentationSeed,
): TavernGeneratedPresetJson => ({
  version: 1,
  label: seed.story.title,
  description: seed.story.outline,
  room: {
    title: seed.story.title,
    storyOutline: seed.story.outline,
    storyGoal: seed.story.goal,
    storyGraph: {
      version: 1,
      entryNodeId: seed.graph.entryNodeId,
      activeNodeId: seed.targetNodeId || seed.graph.activeNodeId,
      stages: seed.graph.stages,
      nodes: seed.graph.nodes.map((node, index) => ({
        ...node,
        type: node.type === "failure" || node.type === "ending" ? node.type : "normal",
        pathRole: node.pathRole === "branch" ? "branch" : "main",
        status: node.status === "ready" || node.status === "played" ? node.status : "draft",
        position: {
          x: 120 + index * 240,
          y: 160,
        },
        createdAt: seed.story.createdAt,
        updatedAt: seed.story.updatedAt,
      })),
      edges: seed.graph.edges.map((edge, index) => ({
        ...edge,
        createdAt: seed.story.createdAt,
        updatedAt: seed.story.updatedAt,
        priority: edge.priority ?? index,
      })),
    },
    userPersonaName: seed.story.userPersonaName,
    scene: seed.scenes[0]?.scene,
    sceneGoal: seed.scenes[0]?.goal,
    plot: seed.scenes[0]?.plot,
    storyDirection: seed.scenes[0]?.direction,
    transition: seed.scenes[0]?.transition,
    memory: seed.scenes[0]?.memory,
    lorebookEntries: seed.world.lorebookEntries.map(mapDraftLorebookEntryToTavern),
    scenes: seed.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      scene: scene.scene,
      sceneGoal: scene.goal,
      plot: scene.plot,
      storyDirection: scene.direction,
      transition: scene.transition,
      memory: scene.memory,
      lorebookEntries: [],
      characterIds: seed.characters.map((character) => character.id),
      activeCharacterId: seed.characters[0]?.id,
    })),
    characterIds: seed.characters.map((character) => character.id),
    activeCharacterId: seed.characters[0]?.id,
  },
  characters: seed.characters.map((character) => ({
    id: character.id,
    name: character.name,
    avatar: resolveStoryCharacterAvatar({
      avatar: character.avatar,
      characterId: character.id,
    }),
    description: character.description,
    speakingStyle: character.speakingStyle,
    writingStyle: character.writingStyle,
    replyStylePrompt: character.replyStylePrompt,
    goals: character.goals,
    memory: formatStoryCharacterMemory(character),
  })),
  messages: [{
    role: "narrator",
    content: seed.openingMessage,
  }],
});
