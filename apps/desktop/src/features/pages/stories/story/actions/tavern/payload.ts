import { buildStoryNodeProjection, type StoryNodeProjection } from "../../model/projection";
import type { TavernPresentationInput } from "@/features/pages/tavern/presentation/input";
import type { TavernStoryGraph, TavernStoryNode } from "@/features/pages/tavern/types";
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
  stages: nodeContext.graph.stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    summary: stage.summary,
    order: stage.order,
  })),
  nodes: nodeContext.graph.nodes.map((node, index) => ({
    id: node.id,
    stageId: node.stageId,
    sceneId: node.sceneId,
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

const createInputFromNodeContext = (nodeContext: StoryNodeProjection): TavernPresentationInput => {
  const activeNodeId = nodeContext.graph.activeNodeId || nodeContext.nodeId;
  const activeNode =
    nodeContext.graph.nodes.find((node) => node.id === activeNodeId) ??
    nodeContext.current.node ??
    nodeContext.graph.nodes.find((node) => node.id === nodeContext.graph.entryNodeId) ??
    nodeContext.graph.nodes[0];
  const activeSceneId = activeNode?.sceneId || nodeContext.current.scene?.id || nodeContext.scenes[0]?.id || "";
  const characterIds = nodeContext.characters.map((character) => character.id);

  return {
    version: 1,
    source: {
      type: "story",
      id: nodeContext.storyId,
      label: nodeContext.background.title,
    },
    meta: {
      title: nodeContext.background.title,
      userPersonaName: nodeContext.background.userPersonaName,
    },
    world: {
      outline: nodeContext.background.outline,
      goal: nodeContext.background.goal,
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
    route: {
      graph: createTavernGraph(nodeContext),
      activeNodeId,
    },
    scenes: {
      activeSceneId,
      items: nodeContext.scenes.map((scene, index) => ({
        id: scene.id,
        title: scene.title,
        order: index,
        scene: scene.scene,
        sceneGoal: scene.goal,
        plot: scene.plot,
        storyDirection: scene.direction,
        transition: scene.transition,
        memory: scene.memory,
        sceneStatus: scene.status
          ? {
              ...scene.status,
              updatedAt: nodeContext.timestamps.updatedAt,
            }
          : undefined,
        characterIds,
        activeCharacterId: characterIds[0],
        createdAt: nodeContext.timestamps.createdAt,
        updatedAt: nodeContext.timestamps.updatedAt,
      })),
    },
    opening: {
      messages: [
        {
          role: "narrator",
          content: `已从故事「${nodeContext.background.title}」进入酒馆演绎。`,
        },
      ],
    },
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
