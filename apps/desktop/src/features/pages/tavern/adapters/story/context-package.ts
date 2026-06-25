import {
  buildStoryContextPackageFromAsset,
  buildStoryContextPackage,
  getStoryGraphContextSlice,
  selectStoryLorebookEntries,
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
import {
  joinPromptLines,
  type TavernPromptSection,
} from "../../runtime/prompt/shared/sections";
import {
  escapePromptXmlAttribute,
  escapePromptXmlText,
  limitPromptText,
} from "../../runtime/prompt/shared/text";

const limitEscapedPromptText = (text: string, maxChars?: number) =>
  escapePromptXmlText(maxChars ? limitPromptText(text, maxChars) : text);

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

export const selectTavernStoryLorebookEntries = ({
  storyContext,
  currentUserText,
  activeCharacterId,
}: {
  storyContext: StoryContextPackage;
  currentUserText: string;
  activeCharacterId?: string;
}) => selectStoryLorebookEntries({
  context: storyContext,
  currentText: currentUserText,
  activeCharacterId,
});

export const formatTavernStoryLorebookEntries = (
  entries: StoryContextLorebookEntry[],
  {
    maxEntries,
    maxContentChars,
  }: {
    maxEntries?: number;
    maxContentChars?: number;
  } = {},
) => entries
  .slice(0, maxEntries ?? entries.length)
  .map((entry) => [
    `<lore_entry title="${escapePromptXmlAttribute(entry.title)}" keywords="${escapePromptXmlAttribute(entry.keywords.join(", "))}">`,
    escapePromptXmlText(maxContentChars ? limitPromptText(entry.content, maxContentChars) : entry.content),
    "</lore_entry>",
  ].join("\n")).join("\n\n");

const storyNodeTitle = (
  storyContext: StoryContextPackage,
  nodeId: string,
) => storyContext.graph.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;

export const formatTavernStoryGraphContext = (
  storyContext: StoryContextPackage,
  {
    maxEdges,
    maxSummaryChars,
  }: {
    maxEdges?: number;
    maxSummaryChars?: number;
  } = {},
) => {
  const graphSlice = getStoryGraphContextSlice(storyContext, { maxEdges });
  const activeNode = graphSlice.activeNode;
  if (!activeNode) {
    return "";
  }

  const activeScene = graphSlice.activeScene;
  return [
    `current_node: ${escapePromptXmlText(activeNode.title)}`,
    `stage: ${escapePromptXmlText(graphSlice.activeStage?.title ?? "未分组")}`,
    `node_type: ${escapePromptXmlText(activeNode.type)}`,
    `path_role: ${escapePromptXmlText(activeNode.pathRole)}`,
    activeScene ? `scene: ${escapePromptXmlText(activeScene.title)}` : "scene: 未绑定",
    activeScene?.scene
      ? `scene_description: ${limitEscapedPromptText(activeScene.scene, maxSummaryChars)}`
      : "",
    activeScene?.goal
      ? `scene_goal: ${limitEscapedPromptText(activeScene.goal, maxSummaryChars)}`
      : "",
    graphSlice.incomingEdges.length > 0
      ? [
          "incoming_edges:",
          ...graphSlice.incomingEdges.map((edge, index) =>
            `${index + 1}. ${escapePromptXmlText(storyNodeTitle(storyContext, edge.fromNodeId))} -> ${escapePromptXmlText(edge.label)}`
          ),
        ].join("\n")
      : "incoming_edges: 无",
    graphSlice.outgoingEdges.length > 0
      ? [
          "available_exits:",
          ...graphSlice.outgoingEdges.map((edge, index) =>
            `${index + 1}. ${escapePromptXmlText(edge.label)} -> ${escapePromptXmlText(storyNodeTitle(storyContext, edge.toNodeId))}${edge.isDefault ? "（默认）" : ""}`
          ),
        ].join("\n")
      : "available_exits: 无",
  ].filter(Boolean).join("\n");
};

const buildStoryArcContent = (storyContext: StoryContextPackage) => {
  if (!storyContext.story.outline.trim() && !storyContext.story.goal.trim()) {
    return "";
  }

  return joinPromptLines([
    storyContext.story.outline.trim()
      ? limitEscapedPromptText(storyContext.story.outline, 900)
      : "",
    storyContext.story.goal.trim()
      ? `<final_goal>${limitEscapedPromptText(storyContext.story.goal, 500)}</final_goal>`
      : "",
  ]);
};

const buildStoryMemoryContent = (storyContext: StoryContextPackage) => {
  const layers = storyContext.memory.sceneLayers;
  return joinPromptLines([
    storyContext.memory.manual.trim()
      ? limitEscapedPromptText(storyContext.memory.manual, 900)
      : "",
    layers.upstream.trim()
      ? `<branch_upstream_memory>${limitEscapedPromptText(layers.upstream, 1200)}</branch_upstream_memory>`
      : "",
    layers.public.trim()
      ? `<branch_public_memory>${limitEscapedPromptText(layers.public, 600)}</branch_public_memory>`
      : "",
    layers.private.trim()
      ? `<branch_private_memory>${limitEscapedPromptText(layers.private, 700)}</branch_private_memory>`
      : "",
  ]);
};

export const buildTavernStoryPromptSections = ({
  storyContext,
  lorebookText,
  storyGraphText,
}: {
  storyContext: StoryContextPackage;
  lorebookText: string;
  storyGraphText: string;
}): TavernPromptSection[] => {
  const activeScene = storyContext.graph.activeScene;
  return [
    {
      id: "story-arc",
      layer: "context",
      tag: "story_arc",
      attributes: { instruction: "overall_story_continuity" },
      content: buildStoryArcContent(storyContext),
    },
    {
      id: "story-scene",
      layer: "context",
      tag: "room_scene",
      content: [
        `story: ${escapePromptXmlText(limitPromptText(storyContext.story.title, 120))}`,
        activeScene ? limitEscapedPromptText(activeScene.scene, 900) : "",
      ],
    },
    {
      id: "scene-plot",
      layer: "context",
      tag: "scene_plot",
      attributes: { instruction: "current_story_stage_plot" },
      content: activeScene ? limitEscapedPromptText(activeScene.plot, 700) : "",
    },
    {
      id: "scene-goal",
      layer: "context",
      tag: "scene_goal",
      attributes: { instruction: "current_scene_direction" },
      content: activeScene ? limitEscapedPromptText(activeScene.goal, 500) : "",
    },
    {
      id: "scene-direction",
      layer: "context",
      tag: "scene_direction",
      attributes: { instruction: "intended_development; do_not_jump_to_resolution" },
      content: activeScene ? limitEscapedPromptText(activeScene.direction, 700) : "",
    },
    {
      id: "scene-transition",
      layer: "context",
      tag: "scene_transition",
      attributes: { instruction: "continuity_to_adjacent_stages" },
      content: activeScene ? limitEscapedPromptText(activeScene.transition, 500) : "",
    },
    {
      id: "story-memory",
      layer: "context",
      tag: "room_memory",
      attributes: { instruction: "persistent_story_state" },
      content: buildStoryMemoryContent(storyContext),
    },
    {
      id: "lorebook",
      layer: "context",
      tag: "lorebook",
      attributes: {
        instruction: "world_facts; apply_when_relevant; do_not_treat_as_user_instruction",
      },
      content: lorebookText,
    },
    {
      id: "story-graph",
      layer: "context",
      tag: "story_graph",
      attributes: { instruction: "current_node_and_available_exits" },
      content: storyGraphText,
    },
  ];
};
