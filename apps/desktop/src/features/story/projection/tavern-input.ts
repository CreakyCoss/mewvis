import type {
  TavernPresentationInput,
} from "@/features/pages/tavern/presentation/input";
import type {
  TavernStoryGraph,
  TavernStoryNode,
} from "@/features/pages/tavern/types";
import type {
  StoryRuntimeContext,
} from "./story-runtime-context";
import { createStoryNodeRuntimeContext } from "./story-runtime-context";
import type { StoryJson } from "../model/story-types";

const trimText = (value: string | undefined | null) => value?.trim() ?? "";

const normalizeTavernNodeType = (
  value: string,
): TavernStoryNode["type"] => value === "failure" || value === "ending" ? value : "normal";

const normalizeTavernPathRole = (
  value: string,
): TavernStoryNode["pathRole"] => value === "branch" ? "branch" : "main";

const normalizeTavernNodeStatus = (
  value: string | undefined,
): TavernStoryNode["status"] =>
  value === "ready" || value === "played" || value === "draft" ? value : "draft";

const createTavernGraphFromStoryRuntimeContext = (
  runtimeData: StoryRuntimeContext,
): TavernStoryGraph => ({
  version: 1,
  entryNodeId: runtimeData.graph.entryNodeId,
  activeNodeId: runtimeData.graph.activeNodeId,
  stages: runtimeData.graph.stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    summary: stage.summary,
    order: stage.order,
  })),
  nodes: runtimeData.graph.nodes.map((node, index) => ({
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
    createdAt: runtimeData.timestamps.createdAt,
    updatedAt: runtimeData.timestamps.updatedAt,
  })),
  edges: runtimeData.graph.edges.map((edge, index) => ({
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    label: edge.label,
    reason: edge.reason,
    isDefault: edge.isDefault,
    priority: typeof edge.priority === "number" ? edge.priority : index,
    createdAt: runtimeData.timestamps.createdAt,
    updatedAt: runtimeData.timestamps.updatedAt,
  })),
});

const formatStoryCharacterMemory = (
  character: StoryRuntimeContext["characters"][number],
) => [
  character.memory?.required,
  character.memory?.public,
  character.memory?.known,
  character.memory?.privateSelf,
].map(trimText).filter(Boolean).join("\n\n");

export const createTavernInputFromStoryRuntimeContext = (
  runtimeData: StoryRuntimeContext,
): TavernPresentationInput => {
  const activeNodeId = runtimeData.graph.activeNodeId || runtimeData.nodeId;
  const activeNode = runtimeData.graph.nodes.find((node) => node.id === activeNodeId) ??
    runtimeData.current.node ??
    runtimeData.graph.nodes.find((node) => node.id === runtimeData.graph.entryNodeId) ??
    runtimeData.graph.nodes[0];
  const activeSceneId = activeNode?.sceneId ||
    runtimeData.current.scene?.id ||
    runtimeData.scenes[0]?.id ||
    "";
  const characterIds = runtimeData.characters.map((character) => character.id);

  return {
    version: 1,
    source: {
      type: "story",
      id: runtimeData.storyId,
      label: runtimeData.background.title,
    },
    meta: {
      title: runtimeData.background.title,
      userPersonaName: runtimeData.background.userPersonaName,
    },
    world: {
      outline: runtimeData.background.outline,
      goal: runtimeData.background.goal,
      lorebookEntries: runtimeData.world.lorebookEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
        enabled: entry.enabled,
        alwaysOn: entry.alwaysOn,
        createdAt: runtimeData.timestamps.createdAt,
        updatedAt: runtimeData.timestamps.updatedAt,
      })),
    },
    cast: {
      characters: runtimeData.characters.map((character) => ({
        id: character.id,
        name: character.name,
        avatar: character.avatar,
        description: character.description,
        speakingStyle: character.speakingStyle,
        writingStyle: character.writingStyle,
        replyStylePrompt: character.replyStylePrompt,
        goals: character.goals,
        memory: formatStoryCharacterMemory(character),
      })),
      characterIds,
      activeCharacterId: characterIds[0],
    },
    route: {
      graph: createTavernGraphFromStoryRuntimeContext(runtimeData),
      activeNodeId,
    },
    scenes: {
      activeSceneId,
      items: runtimeData.scenes.map((scene, index) => ({
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
              updatedAt: runtimeData.timestamps.updatedAt,
            }
          : undefined,
        characterIds,
        activeCharacterId: characterIds[0],
        createdAt: runtimeData.timestamps.createdAt,
        updatedAt: runtimeData.timestamps.updatedAt,
      })),
    },
    opening: {
      messages: [{
        role: "narrator",
        content: `已从故事「${runtimeData.background.title}」进入酒馆演绎。`,
      }],
    },
  };
};

export const createTavernInputFromStory = (
  story: StoryJson,
  {
    nodeId,
  }: {
    nodeId?: string | null;
  } = {},
) => createTavernInputFromStoryRuntimeContext(
  createStoryNodeRuntimeContext(story, { nodeId }),
);
