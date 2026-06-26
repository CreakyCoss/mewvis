import type {
  StoryDataPackage,
} from "@/features/story";
import type {
  TavernPresentationInput,
} from "@/features/pages/tavern/presentation/input";
import type {
  TavernStoryGraph,
  TavernStoryNode,
} from "@/features/pages/tavern/types";

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

const createTavernGraphFromStoryDataPackage = (
  dataPackage: StoryDataPackage,
): TavernStoryGraph => ({
  version: 1,
  entryNodeId: dataPackage.graph.entryNodeId,
  activeNodeId: dataPackage.graph.activeNodeId,
  stages: dataPackage.graph.stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    summary: stage.summary,
    order: stage.order,
  })),
  nodes: dataPackage.graph.nodes.map((node, index) => ({
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
    createdAt: dataPackage.timestamps.createdAt,
    updatedAt: dataPackage.timestamps.updatedAt,
  })),
  edges: dataPackage.graph.edges.map((edge, index) => ({
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    label: edge.label,
    reason: edge.reason,
    isDefault: edge.isDefault,
    priority: typeof edge.priority === "number" ? edge.priority : index,
    createdAt: dataPackage.timestamps.createdAt,
    updatedAt: dataPackage.timestamps.updatedAt,
  })),
});

const formatStoryCharacterMemory = (
  character: StoryDataPackage["characters"][number],
) => [
  character.memory?.required,
  character.memory?.public,
  character.memory?.known,
  character.memory?.privateSelf,
].map(trimText).filter(Boolean).join("\n\n");

export const createTavernPresentationInputFromStoryDataPackage = (
  dataPackage: StoryDataPackage,
): TavernPresentationInput => {
  const activeNodeId = dataPackage.graph.activeNodeId || dataPackage.nodeId;
  const activeNode = dataPackage.graph.nodes.find((node) => node.id === activeNodeId) ??
    dataPackage.current.node ??
    dataPackage.graph.nodes.find((node) => node.id === dataPackage.graph.entryNodeId) ??
    dataPackage.graph.nodes[0];
  const activeSceneId = activeNode?.sceneId ||
    dataPackage.current.scene?.id ||
    dataPackage.scenes[0]?.id ||
    "";
  const characterIds = dataPackage.characters.map((character) => character.id);

  return {
    version: 1,
    source: {
      type: "story",
      id: dataPackage.storyId,
      label: dataPackage.background.title,
    },
    meta: {
      title: dataPackage.background.title,
      userPersonaName: dataPackage.background.userPersonaName,
    },
    world: {
      outline: dataPackage.background.outline,
      goal: dataPackage.background.goal,
      lorebookEntries: dataPackage.world.lorebookEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
        enabled: entry.enabled,
        alwaysOn: entry.alwaysOn,
        createdAt: dataPackage.timestamps.createdAt,
        updatedAt: dataPackage.timestamps.updatedAt,
      })),
    },
    cast: {
      characters: dataPackage.characters.map((character) => ({
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
      graph: createTavernGraphFromStoryDataPackage(dataPackage),
      activeNodeId,
    },
    scenes: {
      activeSceneId,
      items: dataPackage.scenes.map((scene, index) => ({
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
              updatedAt: dataPackage.timestamps.updatedAt,
            }
          : undefined,
        characterIds,
        activeCharacterId: characterIds[0],
        createdAt: dataPackage.timestamps.createdAt,
        updatedAt: dataPackage.timestamps.updatedAt,
      })),
    },
    opening: {
      messages: [{
        role: "narrator",
        content: `已从故事「${dataPackage.background.title}」进入酒馆演绎。`,
      }],
    },
  };
};
