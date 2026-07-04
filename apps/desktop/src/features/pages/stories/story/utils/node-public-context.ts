import type { StoryAcceptedManuscript } from "../modules/manuscripts/manuscript-inbox";
import type { StoryJson } from "../model/types";

export type StoryNodePublicContext = {
  version: 1;
  scope: "node";
  storyId: string;
  nodeId: string;
  timestamps: {
    createdAt: number;
    updatedAt: number;
  };
  background: {
    title: string;
    outline: string;
    goal: string;
    userPersonaName: string;
  };
  current: {
    node: StoryJson["graph"]["nodes"][number] | null;
    stage: StoryJson["graph"]["stages"][number] | null;
    scene: StoryJson["scenes"][number] | null;
    progress: string;
  };
  branch: {
    pathNodeIds: string[];
    pathEdgeIds: string[];
    incomingEdges: StoryJson["graph"]["edges"];
    outgoingEdges: StoryJson["graph"]["edges"];
  };
  graph: {
    entryNodeId: string;
    activeNodeId: string;
    stages: StoryJson["graph"]["stages"];
    nodes: StoryJson["graph"]["nodes"];
    edges: StoryJson["graph"]["edges"];
  };
  scenes: StoryJson["scenes"];
  world: {
    lorebookEntries: StoryJson["lorebookEntries"];
  };
  characters: StoryJson["characters"];
  memory: {
    acceptedManuscripts: StoryAcceptedManuscript[];
    characterPublicMemories: Array<{
      characterId: string;
      name: string;
      memory: string;
    }>;
  };
};

export const buildStoryNodePublicContext = (story: StoryJson, nodeId?: string | null): StoryNodePublicContext => {
  const node = getNode(story, compact(nodeId));
  const resolvedNodeId = node?.id ?? "";
  const stage = node ? (story.graph.stages.find((item) => item.id === node.stageId) ?? null) : null;
  const scene = getSceneForNode(story, node);
  const pathNodeIds = unique([resolvedNodeId]);
  const acceptedNodeIds = new Set(pathNodeIds);
  const acceptedManuscripts = story.manuscriptInbox.accepted.filter(
    (item) => acceptedNodeIds.size === 0 || acceptedNodeIds.has(item.nodeId),
  );
  const progress = [scene?.plot, ...acceptedManuscripts.map((item) => item.summary || item.content)]
    .map(compact)
    .filter(Boolean)
    .join("\n\n");

  return {
    version: 1,
    scope: "node",
    storyId: story.id,
    nodeId: resolvedNodeId,
    timestamps: {
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    },
    background: {
      title: story.title,
      outline: story.outline,
      goal: story.goal,
      userPersonaName: story.userPersonaName,
    },
    current: {
      node,
      stage,
      scene,
      progress,
    },
    branch: {
      pathNodeIds,
      pathEdgeIds: [],
      incomingEdges: story.graph.edges.filter((edge) => edge.toNodeId === resolvedNodeId),
      outgoingEdges: story.graph.edges.filter((edge) => edge.fromNodeId === resolvedNodeId),
    },
    graph: {
      entryNodeId: story.graph.entryNodeId,
      activeNodeId: resolvedNodeId || story.graph.activeNodeId,
      stages: story.graph.stages,
      nodes: story.graph.nodes,
      edges: story.graph.edges,
    },
    scenes: story.scenes,
    world: {
      lorebookEntries: story.lorebookEntries,
    },
    characters: story.characters,
    memory: {
      acceptedManuscripts,
      characterPublicMemories: story.characters.flatMap((character) => {
        const memory = compact(character.memory?.public);
        return memory
          ? [
              {
                characterId: character.id,
                name: character.name,
                memory,
              },
            ]
          : [];
      }),
    },
  };
};

const compact = (value: string | undefined | null) => value?.trim() ?? "";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const getNode = (story: StoryJson, nodeId: string) =>
  story.graph.nodes.find((node) => node.id === nodeId) ??
  story.graph.nodes.find((node) => node.id === story.graph.activeNodeId) ??
  story.graph.nodes.find((node) => node.id === story.graph.entryNodeId) ??
  story.graph.nodes[0] ??
  null;

const getSceneForNode = (story: StoryJson, node: StoryJson["graph"]["nodes"][number] | null) =>
  node?.sceneId ? (story.scenes.find((scene) => scene.id === node.sceneId) ?? null) : null;
