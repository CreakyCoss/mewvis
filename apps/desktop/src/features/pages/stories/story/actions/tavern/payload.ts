import { buildStoryNodeProjection, type StoryNodeProjection } from "../../model/projection";
import type { TavernRoomOpeningInput, TavernStoryGraph, TavernStoryNode } from "@/features/pages/taverns/room/model";
import type { StoryJson } from "../../model/types";

const trimText = (value: string | undefined | null) => value?.trim() ?? "";

const createTavernGraph = (nodeContext: StoryNodeProjection): TavernStoryGraph => ({
  version: 1,
  entryNodeId: nodeContext.graph.entryNodeId,
  activeNodeId: nodeContext.graph.activeNodeId,
  nodes: nodeContext.graph.nodes.map((node, index) => ({
    id: node.id,
    title: node.title,
    type: node.type as TavernStoryNode["type"],
    pathRole: node.pathRole as TavernStoryNode["pathRole"],
    position: {
      x: 120 + index * 240,
      y: 160,
    },
    status: node.status as TavernStoryNode["status"],
    createdAt: nodeContext.timestamps.createdAt,
    updatedAt: nodeContext.timestamps.updatedAt,
  })),
  edges: nodeContext.graph.edges.map((edge) => ({
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    label: edge.label,
    reason: edge.reason,
    isDefault: edge.isDefault,
    priority: edge.priority,
    createdAt: nodeContext.timestamps.createdAt,
    updatedAt: nodeContext.timestamps.updatedAt,
  })),
});

const createInputFromNodeContext = (nodeContext: StoryNodeProjection): TavernRoomOpeningInput => {
  const characterIds = nodeContext.characters.map((character) => character.id);
  const activeScene = nodeContext.current.scene!;

  return {
    version: 1,
    source: {
      type: "story",
      id: nodeContext.storyId,
      label: nodeContext.background.title,
    },
    title: nodeContext.background.title,
    userPersonaName: nodeContext.background.userPersonaName,
    story: {
      outline: nodeContext.background.outline,
      goal: nodeContext.background.goal,
      graph: createTavernGraph(nodeContext),
    },
    world: {
      lorebookEntries: nodeContext.world.lorebookEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
        enabled: entry.enabled,
        alwaysOn: entry.alwaysOn,
        createdAt: nodeContext.timestamps.createdAt,
        updatedAt: nodeContext.timestamps.updatedAt,
      })),
    },
    cast: {
      characters: nodeContext.characters.map((character) => ({
        id: character.id,
        name: character.name,
        avatar: character.avatar,
        description: character.description,
        speakingStyle: character.speakingStyle,
        writingStyle: character.writingStyle,
        replyStylePrompt: character.replyStylePrompt,
        goals: character.goals,
        memoryLayers: {
          required: trimText(character.memory?.required),
          public: trimText(character.memory?.public),
          known: trimText(character.memory?.known),
          privateSelf: trimText(character.memory?.privateSelf),
          directorSecret: trimText(character.memory?.directorSecret),
        },
      })),
      characterIds,
      activeCharacterId: characterIds[0],
    },
    scene: {
      title: activeScene.title,
      scene: activeScene.scene,
      sceneGoal: activeScene.goal,
      plot: activeScene.plot,
      storyDirection: activeScene.direction,
      transition: activeScene.transition,
      memoryLayers: {
        required: trimText(activeScene.memory),
      },
      sceneStatus: activeScene.status
        ? {
            ...activeScene.status,
            updatedAt: nodeContext.timestamps.updatedAt,
          }
        : undefined,
      characterIds,
      activeCharacterId: characterIds[0],
      createdAt: nodeContext.timestamps.createdAt,
      updatedAt: nodeContext.timestamps.updatedAt,
    },
    openingMessages: [
      {
        role: "narrator",
        text: `已从故事「${nodeContext.background.title}」进入酒馆演绎。`,
      },
    ],
  };
};

export const createTavernPayload = (
  story: StoryJson,
  {
    nodeId,
  }: {
    nodeId?: string | null;
  } = {},
) => createInputFromNodeContext(buildStoryNodeProjection(story, nodeId));
