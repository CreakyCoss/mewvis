import { formatTavernCharacterRelationships } from "../../tavern/core";
import type { TavernCharacter, TavernLorebookEntry, TavernSceneStatus } from "@/features/pages/taverns/manage/model";
import type {
  TavernCharacterMemoryLayers,
  TavernRuntimeRoom as TavernRoom,
  TavernScene,
  TavernSceneMemoryLayers,
  TavernStoryEdge,
  TavernStoryGraph,
  TavernStoryNode,
} from "@/features/pages/taverns/room/model";
import {
  getTavernRuntimeStoryProjection,
  type TavernRuntimeStoryProjection,
  type TavernRuntimeStorySceneProjection,
} from "./projection";

export type TavernStoryContextLorebookEntry = Pick<
  TavernLorebookEntry,
  "id" | "title" | "content" | "keywords" | "enabled" | "alwaysOn"
>;

export type TavernStoryContextScene = {
  id: string;
  title: string;
  scene: string;
  goal: string;
  plot: string;
  direction: string;
  transition: string;
  memory: string;
  status?: TavernSceneStatus;
};

export type TavernStoryContextMemoryLayers = Pick<
  TavernSceneMemoryLayers,
  "required" | "public" | "private" | "directorSecret"
>;

export type TavernStoryContextCharacterMemory = Pick<
  TavernCharacterMemoryLayers,
  "required" | "public" | "known" | "privateSelf" | "directorSecret"
>;

export type TavernStoryContextCharacter = Pick<
  TavernCharacter,
  "id" | "name" | "avatar" | "description" | "speakingStyle" | "writingStyle" | "replyStylePrompt" | "goals"
> & {
  relationshipSummary?: string;
  publicRelationshipSummary?: string;
  memory?: TavernStoryContextCharacterMemory;
};

export type TavernStoryContextPackageInput = {
  story: {
    id: string;
    title: string;
    outline: string;
    goal: string;
    userPersonaName?: string;
  };
  graph: TavernStoryGraph;
  scenes: TavernStoryContextScene[];
  activeScene?: TavernStoryContextScene;
  lorebookEntries: TavernStoryContextLorebookEntry[];
  characters: TavernStoryContextCharacter[];
  memory?: {
    manual?: string;
    sceneLayers?: Partial<TavernStoryContextMemoryLayers>;
  };
  branch?: {
    pathNodeIds?: string[];
    pathEdgeIds?: string[];
  };
};

export type TavernStoryContextPackage = {
  version: 1;
  story: TavernStoryContextPackageInput["story"];
  graph: TavernStoryGraph & {
    activeNode?: TavernStoryNode;
    activeScene?: TavernStoryContextScene;
  };
  scenes: TavernStoryContextScene[];
  world: {
    lorebookEntries: TavernStoryContextLorebookEntry[];
  };
  characters: TavernStoryContextCharacter[];
  memory: {
    manual: string;
    sceneLayers: TavernStoryContextMemoryLayers;
  };
  branch: {
    pathNodeIds: string[];
    pathEdgeIds: string[];
  };
};

export type TavernStoryGraphContextSlice = {
  activeNode?: TavernStoryNode;
  activeScene?: TavernStoryContextScene;
  incomingEdges: TavernStoryEdge[];
  outgoingEdges: TavernStoryEdge[];
};

const trimText = (value: string | undefined) => value?.trim() ?? "";

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

const createEmptySceneLayers = (
  input: Partial<TavernStoryContextMemoryLayers> = {},
): TavernStoryContextMemoryLayers => ({
  required: trimText(input.required),
  public: trimText(input.public),
  private: trimText(input.private),
  directorSecret: trimText(input.directorSecret),
});

const sceneTitle = (scene: Pick<TavernScene, "title" | "scene">, fallback: string) =>
  scene.title?.trim() || scene.scene.trim().split("\n")[0]?.slice(0, 40) || fallback;

const mapTavernLorebookEntry = (entry: TavernLorebookEntry): TavernStoryContextLorebookEntry => ({
  id: entry.id,
  title: entry.title,
  content: entry.content,
  keywords: entry.keywords,
  enabled: entry.enabled,
  alwaysOn: entry.alwaysOn,
});

const mapTavernScene = (scene: TavernScene, fallbackTitle: string): TavernStoryContextScene => ({
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

const mapTavernRuntimeSceneProjection = (scene: TavernRuntimeStorySceneProjection): TavernStoryContextScene => ({
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
}): TavernStoryContextCharacter => {
  const layers = projection.activeSceneInstance?.characterMemoryLayers?.[character.id];
  const baseMemory = room.characterMemories[character.id];
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
      includePrivate: true,
    }),
    publicRelationshipSummary: formatTavernCharacterRelationships({
      character,
      characters,
      userPersonaName: room.userPersonaName,
      relationshipOverrides: room.relationshipOverrides,
      includePrivate: false,
    }),
    memory: {
      required: trimText(layers?.required),
      public: mergePromptTexts(baseMemory, layers?.public),
      known: trimText(layers?.known),
      privateSelf: trimText(layers?.privateSelf),
      directorSecret: trimText(layers?.directorSecret),
    },
  };
};

const buildTavernStoryContextPackageFromInput = (input: TavernStoryContextPackageInput): TavernStoryContextPackage => {
  const activeNode =
    input.graph.nodes.find((node) => node.id === input.graph.activeNodeId) ??
    input.graph.nodes.find((node) => node.id === input.graph.entryNodeId) ??
    input.graph.nodes[0];
  const activeScene =
    (activeNode?.sceneId ? input.scenes.find((scene) => scene.id === activeNode.sceneId) : undefined) ??
    input.activeScene;

  return {
    version: 1,
    story: {
      id: input.story.id,
      title: trimText(input.story.title),
      outline: trimText(input.story.outline),
      goal: trimText(input.story.goal),
      userPersonaName: trimText(input.story.userPersonaName),
    },
    graph: {
      ...input.graph,
      activeNodeId: activeNode?.id ?? input.graph.activeNodeId,
      activeNode,
      activeScene,
    },
    scenes: input.scenes,
    world: {
      lorebookEntries: input.lorebookEntries,
    },
    characters: input.characters,
    memory: {
      manual: trimText(input.memory?.manual),
      sceneLayers: createEmptySceneLayers(input.memory?.sceneLayers),
    },
    branch: {
      pathNodeIds: input.branch?.pathNodeIds ?? [],
      pathEdgeIds: input.branch?.pathEdgeIds ?? [],
    },
  };
};

export const buildTavernStoryContextPackage = ({
  room,
  characters,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
}): TavernStoryContextPackage => {
  const projection = getTavernRuntimeStoryProjection(room, characters);
  const activeScene = mapTavernRuntimeSceneProjection(projection.activeScene);
  const scenes = [
    ...projection.scenes.map((scene, index) =>
      scene.id === activeScene.id ? activeScene : mapTavernScene(scene, `场景 ${index + 1}`),
    ),
    ...(projection.scenes.some((scene) => scene.id === activeScene.id) ? [] : [activeScene]),
  ];

  return buildTavernStoryContextPackageFromInput({
    story: projection.story,
    graph: projection.graph,
    scenes,
    activeScene,
    lorebookEntries: projection.lorebookEntries.map(mapTavernLorebookEntry),
    characters: projection.characters.map((character) =>
      mapTavernCharacter({
        character,
        room,
        characters: projection.characters,
        projection,
      }),
    ),
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

export const getTavernStoryGraphContextSlice = (
  context: TavernStoryContextPackage,
  {
    maxEdges,
  }: {
    maxEdges?: number;
  } = {},
): TavernStoryGraphContextSlice => {
  const activeNode = context.graph.activeNode;
  if (!activeNode) {
    return {
      incomingEdges: [],
      outgoingEdges: [],
    };
  }

  const incomingEdges = context.graph.edges
    .filter((edge) => edge.toNodeId === activeNode.id)
    .slice(0, maxEdges ?? context.graph.edges.length);
  const outgoingEdges = context.graph.edges
    .filter((edge) => edge.fromNodeId === activeNode.id)
    .slice(0, maxEdges ?? context.graph.edges.length);

  return {
    activeNode,
    activeScene: context.graph.activeScene,
    incomingEdges,
    outgoingEdges,
  };
};

const normalizeSearchText = (text: string) => text.toLowerCase();

export const selectTavernStoryLorebookEntries = ({
  context,
  currentText,
  activeCharacterId,
}: {
  context: TavernStoryContextPackage;
  currentText: string;
  activeCharacterId?: string;
}) => {
  const activeCharacter = activeCharacterId
    ? context.characters.find((character) => character.id === activeCharacterId)
    : undefined;
  const activeScene = context.graph.activeScene;
  const matchText = normalizeSearchText(
    [
      currentText,
      context.story.title,
      context.story.outline,
      context.story.goal,
      activeScene?.scene ?? "",
      activeScene?.goal ?? "",
      activeScene?.plot ?? "",
      activeCharacter?.name ?? "",
      context.characters
        .map((character) =>
          [
            character.name,
            character.description,
            character.goals ?? "",
            character.publicRelationshipSummary ?? character.relationshipSummary ?? "",
          ].join("\n"),
        )
        .join("\n\n"),
    ].join("\n\n"),
  );

  return context.world.lorebookEntries
    .filter((entry) => entry.enabled)
    .filter((entry) => entry.alwaysOn || entry.keywords.some((keyword) => matchText.includes(keyword.toLowerCase())));
};
