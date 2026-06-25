import {
  buildStoryContextPackageFromAsset,
  buildStoryContextPackage,
  type StoryAsset,
  type StoryContextCharacter,
  type StoryContextLorebookEntry,
  type StoryContextPackage,
  type StoryContextScene,
  type StoryState,
} from "@/features/story";
import {
  formatTavernCharacterRelationships,
} from "../../core";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernRoom,
  TavernScene,
} from "../../types";
import {
  getTavernRuntimeStoryProjection,
  type TavernRuntimeStoryProjection,
  type TavernRuntimeStorySceneProjection,
} from "./projection";

const mergePromptTexts = (...values: Array<string | undefined>) => {
  const seen = new Set<string>();
  return values
    .flatMap((value) => {
      const text = value?.trim();
      if (!text || seen.has(text)) {
        return [];
      }
      seen.add(text);
      return [text];
    })
    .join("\n\n");
};

const sceneTitle = (scene: Pick<TavernScene, "title" | "scene">, fallback: string) =>
  scene.title?.trim() || scene.scene.trim().split("\n")[0]?.slice(0, 40) || fallback;

const mapTavernLorebookEntry = (
  entry: TavernLorebookEntry,
): StoryContextLorebookEntry => ({
  id: entry.id,
  title: entry.title,
  content: entry.content,
  keywords: entry.keywords,
  enabled: entry.enabled,
  alwaysOn: entry.alwaysOn,
});

const mapTavernScene = (
  scene: TavernScene,
  fallbackTitle: string,
): StoryContextScene => ({
  id: scene.id,
  title: sceneTitle(scene, fallbackTitle),
  scene: scene.scene,
  goal: scene.sceneGoal,
  plot: scene.plot,
  direction: scene.storyDirection,
  transition: scene.transition,
  memory: scene.memory,
  status: scene.sceneStatus,
});

const mapTavernRuntimeSceneProjection = (
  scene: TavernRuntimeStorySceneProjection,
): StoryContextScene => ({
  id: scene.id,
  title: scene.title,
  scene: scene.scene,
  goal: scene.goal,
  plot: scene.plot,
  direction: scene.direction,
  transition: scene.transition,
  memory: scene.memory,
  status: scene.status,
});

const mapTavernCharacter = ({
  character,
  room,
  characters,
  projection,
}: {
  character: TavernCharacter;
  room: TavernRoom;
  characters: TavernCharacter[];
  projection: TavernRuntimeStoryProjection;
}): StoryContextCharacter => {
  const layers = projection.activeSceneInstance?.characterMemoryLayers?.[character.id];
  return {
    id: character.id,
    name: character.name,
    avatar: character.avatar,
    description: character.description,
    speakingStyle: character.speakingStyle,
    writingStyle: character.writingStyle,
    replyStylePrompt: character.replyStylePrompt,
    goals: character.goals,
    relationshipSummary: formatTavernCharacterRelationships({
      character,
      characters,
      userPersonaName: room.userPersonaName,
      relationshipOverrides: room.relationshipOverrides,
      statusSnapshot: room.statusSnapshot,
      includePrivate: true,
    }),
    publicRelationshipSummary: formatTavernCharacterRelationships({
      character,
      characters,
      userPersonaName: room.userPersonaName,
      relationshipOverrides: room.relationshipOverrides,
      statusSnapshot: room.statusSnapshot,
      includePrivate: false,
    }),
    memory: {
      required: layers?.required?.trim() ?? "",
      public: layers?.public?.trim() ?? "",
      known: layers?.known?.trim() ?? "",
      privateSelf: layers?.privateSelf?.trim() ?? "",
      directorSecret: layers?.directorSecret?.trim() ?? "",
    },
  };
};

const mapBoundStoryCharacter = ({
  storyCharacter,
  tavernCharacter,
  room,
  characters,
  story,
  projection,
}: {
  storyCharacter: StoryContextCharacter;
  tavernCharacter?: TavernCharacter;
  room: TavernRoom;
  characters: TavernCharacter[];
  story: StoryAsset;
  projection: TavernRuntimeStoryProjection;
}): StoryContextCharacter => {
  const layers = projection.activeSceneInstance?.characterMemoryLayers?.[storyCharacter.id];
  const relationshipSummary = tavernCharacter
    ? formatTavernCharacterRelationships({
        character: tavernCharacter,
        characters,
        userPersonaName: story.userPersonaName,
        relationshipOverrides: room.relationshipOverrides,
        statusSnapshot: room.statusSnapshot,
        includePrivate: true,
      })
    : storyCharacter.relationshipSummary;
  const publicRelationshipSummary = tavernCharacter
    ? formatTavernCharacterRelationships({
        character: tavernCharacter,
        characters,
        userPersonaName: story.userPersonaName,
        relationshipOverrides: room.relationshipOverrides,
        statusSnapshot: room.statusSnapshot,
        includePrivate: false,
      })
    : storyCharacter.publicRelationshipSummary;

  return {
    ...storyCharacter,
    relationshipSummary,
    publicRelationshipSummary,
    memory: {
      required: mergePromptTexts(storyCharacter.memory?.required, layers?.required),
      public: mergePromptTexts(storyCharacter.memory?.public, layers?.public),
      known: mergePromptTexts(storyCharacter.memory?.known, layers?.known),
      privateSelf: mergePromptTexts(storyCharacter.memory?.privateSelf, layers?.privateSelf),
      directorSecret: mergePromptTexts(
        storyCharacter.memory?.directorSecret,
        layers?.directorSecret,
      ),
    },
  };
};

const buildTavernBoundStoryContextPackage = ({
  room,
  characters,
  story,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  story: StoryAsset;
}): StoryContextPackage => {
  const projection = getTavernRuntimeStoryProjection(room, characters);
  const activeNodeId = projection.activeSceneInstance?.nodeId && story.graph.nodes.some((node) =>
    node.id === projection.activeSceneInstance?.nodeId
  )
    ? projection.activeSceneInstance.nodeId
    : story.graph.activeNodeId;
  const activeNode = story.graph.nodes.find((node) => node.id === activeNodeId) ??
    story.graph.nodes.find((node) => node.id === story.graph.entryNodeId) ??
    story.graph.nodes[0];
  const storyActiveScene = activeNode?.sceneId
    ? story.scenes.find((scene) => scene.id === activeNode.sceneId)
    : undefined;
  const activeScene = storyActiveScene
    ? {
        ...storyActiveScene,
        status: projection.activeSceneInstance?.sceneStatus ?? storyActiveScene.status,
      }
    : undefined;
  const storyCharacterIds = new Set(story.characters.map((character) => character.id));
  const tavernCharacterById = new Map(projection.characters.map((character) => [character.id, character]));
  const storyCharacters = story.characters.map((storyCharacter) =>
    mapBoundStoryCharacter({
      storyCharacter,
      tavernCharacter: tavernCharacterById.get(storyCharacter.id),
      room,
      characters: projection.characters,
      story,
      projection,
    })
  );
  const extraTavernCharacters = projection.characters
    .filter((character) => !storyCharacterIds.has(character.id))
    .map((character) => mapTavernCharacter({
      character,
      room,
      characters: projection.characters,
      projection,
    }));

  return buildStoryContextPackageFromAsset(story, {
    activeNodeId,
    activeScene,
    characters: [...storyCharacters, ...extraTavernCharacters],
    memory: {
      manual: activeScene?.memory ?? "",
      sceneLayers: projection.activeSceneInstance?.memoryLayers,
    },
    branch: {
      pathNodeIds: projection.branch.pathNodeIds,
      pathEdgeIds: projection.branch.pathEdgeIds,
    },
  });
};

export const resolveTavernRuntimeStoryContextPackage = ({
  room,
  characters,
  storyState,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  storyState?: StoryState | null;
}): StoryContextPackage => {
  const storyId = room.storyBinding?.storyId;
  const story = storyId
    ? storyState?.stories.find((item) => item.id === storyId)
    : undefined;

  return story
    ? buildTavernBoundStoryContextPackage({ room, characters, story })
    : buildTavernStoryContextPackage({ room, characters });
};

export const buildTavernStoryContextPackage = ({
  room,
  characters,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
}): StoryContextPackage => {
  const projection = getTavernRuntimeStoryProjection(room, characters);
  const activeScene = mapTavernRuntimeSceneProjection(projection.activeScene);
  const scenes = [
    ...projection.scenes.map((scene, index) =>
      scene.id === activeScene.id ? activeScene : mapTavernScene(scene, `场景 ${index + 1}`)
    ),
    ...(
      projection.scenes.some((scene) => scene.id === activeScene.id)
        ? []
        : [activeScene]
    ),
  ];

  return buildStoryContextPackage({
    story: projection.story,
    graph: {
      entryNodeId: projection.graph.entryNodeId,
      activeNodeId: projection.graph.activeNodeId,
      stages: projection.graph.stages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        summary: stage.summary,
        order: stage.order,
      })),
      nodes: projection.graph.nodes.map((node) => ({
        id: node.id,
        stageId: node.stageId,
        sceneId: node.sceneId,
        title: node.title,
        type: node.type,
        pathRole: node.pathRole,
        status: node.status,
      })),
      edges: projection.graph.edges.map((edge) => ({
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        label: edge.label,
        reason: edge.reason,
        isDefault: edge.isDefault,
        priority: edge.priority,
      })),
    },
    scenes,
    activeScene,
    lorebookEntries: projection.lorebookEntries.map(mapTavernLorebookEntry),
    characters: projection.characters.map((character) => mapTavernCharacter({
      character,
      room,
      characters: projection.characters,
      projection,
    })),
    memory: {
      manual: projection.activeScene.memory,
      sceneLayers: projection.activeSceneInstance?.memoryLayers,
    },
    branch: {
      pathNodeIds: projection.branch.pathNodeIds,
      pathEdgeIds: projection.branch.pathEdgeIds,
    },
  });
};
