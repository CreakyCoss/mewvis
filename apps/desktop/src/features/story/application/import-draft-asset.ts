import { createEmptyStoryManuscriptInbox } from "./manuscript-inbox";
import {
  assertStoryImportDraftReady,
  type StoryImportDraft,
} from "./import-draft";
import type {
  StoryContextCharacter,
  StoryContextLorebookEntry,
  StoryContextScene,
} from "./context-package";
import type { StoryAsset } from "./state";
import { resolveStoryCharacterAvatar } from "./character-avatar";

const createImportedStoryId = () => `story-${crypto.randomUUID()}`;

const createImportedStoryLocalId = (storyId: string, prefix: string, index: number) =>
  `${storyId}-${prefix}-${index + 1}`;

const createImportedLorebookEntries = (
  storyId: string,
  draft: StoryImportDraft,
  offset = 0,
): StoryContextLorebookEntry[] => [
  ...draft.lorebookEntries,
  ...draft.scenes.flatMap((scene) => scene.lorebookEntries),
].map((entry, index): StoryContextLorebookEntry => ({
  id: entry.id || createImportedStoryLocalId(storyId, "lore", offset + index),
  title: entry.title || `世界书 ${offset + index + 1}`,
  content: entry.content,
  keywords: entry.keywords,
  enabled: entry.enabled,
  alwaysOn: entry.alwaysOn,
}));

const createImportedCharacters = (
  storyId: string,
  draft: StoryImportDraft,
  offset = 0,
): StoryContextCharacter[] => draft.characters.map((character, index): StoryContextCharacter => ({
  id: character.id || createImportedStoryLocalId(storyId, "character", offset + index),
  name: character.name || `角色 ${offset + index + 1}`,
  avatar: resolveStoryCharacterAvatar({
    avatar: character.avatar,
    characterId: character.id,
    index: offset + index,
  }),
  description: character.description,
  speakingStyle: character.speakingStyle,
  writingStyle: character.writingStyle,
  replyStylePrompt: character.replyStylePrompt,
  goals: character.goals,
  relationshipSummary: Array.isArray(character.relationships)
    ? JSON.stringify(character.relationships)
    : undefined,
  memory: character.memory
    ? {
        required: "",
        public: character.memory,
        known: "",
        privateSelf: "",
        directorSecret: "",
      }
    : undefined,
}));

const createImportedScenes = (
  storyId: string,
  draft: StoryImportDraft,
  offset = 0,
): StoryContextScene[] => draft.scenes.map((scene, index): StoryContextScene => ({
  id: scene.id || createImportedStoryLocalId(storyId, "scene", offset + index),
  title: scene.title || `场景 ${offset + index + 1}`,
  scene: scene.scene,
  goal: scene.goal,
  plot: scene.plot,
  direction: scene.direction,
  transition: scene.transition,
  memory: scene.memory,
}));

export const createStoryAssetFromImportDraft = ({
  workspaceId,
  draft,
  timestamp = Date.now(),
}: {
  workspaceId: string;
  draft: StoryImportDraft;
  timestamp?: number;
}): StoryAsset => {
  assertStoryImportDraftReady(draft);
  if (draft.mode !== "story") {
    throw new Error("世界书补丁不能创建为独立故事。");
  }

  const storyId = createImportedStoryId();
  const importedScenes = createImportedScenes(storyId, draft);
  const scenes = importedScenes.length > 0
    ? importedScenes
    : [{
        id: createImportedStoryLocalId(storyId, "scene", 0),
        title: "起始场景",
        scene: draft.story.outline,
        goal: draft.story.goal,
        plot: "",
        direction: "",
        transition: "",
        memory: "",
      }];
  const stageId = createImportedStoryLocalId(storyId, "stage", 0);
  const nodeId = createImportedStoryLocalId(storyId, "node", 0);

  return {
    id: storyId,
    workspaceId,
    title: draft.story.title.trim() || "导入故事",
    outline: draft.story.outline,
    goal: draft.story.goal,
    userPersonaName: draft.story.userPersonaName.trim() || "我",
    characters: createImportedCharacters(storyId, draft),
    lorebookEntries: createImportedLorebookEntries(storyId, draft),
    scenes,
    graph: {
      entryNodeId: nodeId,
      activeNodeId: nodeId,
      stages: [{
        id: stageId,
        title: "起始阶段",
        summary: draft.description,
        order: 0,
      }],
      nodes: [{
        id: nodeId,
        stageId,
        sceneId: scenes[0]?.id,
        title: "起始节点",
        type: "normal",
        pathRole: "main",
        status: "draft",
      }],
      edges: [],
    },
    manuscriptInbox: createEmptyStoryManuscriptInbox(),
    sourceRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const mergeStoryImportDraftIntoStory = (
  story: StoryAsset,
  draft: StoryImportDraft,
  {
    timestamp = Date.now(),
  }: {
    timestamp?: number;
  } = {},
): StoryAsset => {
  assertStoryImportDraftReady(draft);
  const importedLorebookEntries = createImportedLorebookEntries(
    story.id,
    draft,
    story.lorebookEntries.length,
  );

  if (draft.mode === "lorebookPatch") {
    return {
      ...story,
      lorebookEntries: [
        ...story.lorebookEntries,
        ...importedLorebookEntries,
      ],
      updatedAt: timestamp,
    };
  }

  return {
    ...story,
    title: draft.story.title.trim() || story.title,
    outline: draft.story.outline || story.outline,
    goal: draft.story.goal || story.goal,
    userPersonaName: draft.story.userPersonaName.trim() || story.userPersonaName,
    characters: [
      ...story.characters,
      ...createImportedCharacters(story.id, draft, story.characters.length),
    ],
    lorebookEntries: [...story.lorebookEntries, ...importedLorebookEntries],
    scenes: [
      ...story.scenes,
      ...createImportedScenes(story.id, draft, story.scenes.length),
    ],
    updatedAt: timestamp,
  };
};
