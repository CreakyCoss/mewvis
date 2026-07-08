import { buildStoryNodeProjection, type StoryNodeProjection } from "../../model/projection";
import type { TavernRoomOpeningInput, TavernStoryGraph, TavernStoryNode } from "@/features/pages/taverns/room/model";
import type { StoryJson } from "../../model/types";

const trimText = (value: string | undefined | null) => value?.trim() ?? "";

const normalizeTavernNodeType = (value: string): TavernStoryNode["type"] =>
  value === "failure" || value === "ending" ? value : "normal";

const normalizeTavernPathRole = (value: string): TavernStoryNode["pathRole"] =>
  value === "branch" ? "branch" : "main";

const normalizeTavernNodeStatus = (value: string | undefined): TavernStoryNode["status"] =>
  value === "ready" || value === "played" || value === "draft" ? value : "draft";

const createTavernGraph = (nodeContext: StoryNodeProjection): TavernStoryGraph => ({
  version: 1,
  entryNodeId: nodeContext.graph.entryNodeId,
  activeNodeId: nodeContext.graph.activeNodeId,
  nodes: nodeContext.graph.nodes.map((node, index) => ({
    id: node.id,
    title: node.title,
    type: normalizeTavernNodeType(node.type),
    pathRole: normalizeTavernPathRole(node.pathRole),
    position: {
      x: 120 + index * 240,
      y: 160,
    },
    status: normalizeTavernNodeStatus(node.status),
    createdAt: nodeContext.timestamps.createdAt,
    updatedAt: nodeContext.timestamps.updatedAt,
  })),
  edges: nodeContext.graph.edges.map((edge, index) => ({
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    label: edge.label,
    reason: edge.reason,
    isDefault: edge.isDefault,
    priority: typeof edge.priority === "number" ? edge.priority : index,
    createdAt: nodeContext.timestamps.createdAt,
    updatedAt: nodeContext.timestamps.updatedAt,
  })),
});

const formatCharacterMemory = (character: StoryNodeProjection["characters"][number]) =>
  [character.memory?.required, character.memory?.public, character.memory?.known, character.memory?.privateSelf]
    .map(trimText)
    .filter(Boolean)
    .join("\n\n");

const createInputFromNodeContext = (nodeContext: StoryNodeProjection): TavernRoomOpeningInput => {
  const activeNodeId = nodeContext.graph.activeNodeId || nodeContext.nodeId;
  const activeNode =
    nodeContext.graph.nodes.find((node) => node.id === activeNodeId) ??
    nodeContext.current.node ??
    nodeContext.graph.nodes.find((node) => node.id === nodeContext.graph.entryNodeId) ??
    nodeContext.graph.nodes[0];
  const characterIds = nodeContext.characters.map((character) => character.id);

  const activeScene = nodeContext.current.scene ?? nodeContext.scenes[0] ?? null;

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
      activeNodeId,
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
        memory: formatCharacterMemory(character),
      })),
      characterIds,
      activeCharacterId: characterIds[0],
    },
    scene: {
      title: activeScene?.title ?? activeNode?.title ?? "当前场景",
      scene: activeScene?.scene,
      sceneGoal: activeScene?.goal,
      plot: activeScene?.plot,
      storyDirection: activeScene?.direction,
      transition: activeScene?.transition,
      memory: activeScene?.memory,
      sceneStatus: activeScene?.status
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
        content: `已从故事「${nodeContext.background.title}」进入酒馆演绎。`,
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
