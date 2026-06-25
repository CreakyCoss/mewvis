import {
  buildStoryContextPackageFromAsset,
  type StoryAsset,
} from "./state";
import type {
  StoryAcceptedManuscript,
} from "./manuscript-inbox";

export type StoryDataPackageScope = "node" | "branch";

export type StoryDataPackage = {
  version: 1;
  scope: StoryDataPackageScope;
  storyId: string;
  nodeId: string;
  background: {
    title: string;
    outline: string;
    goal: string;
    userPersonaName: string;
  };
  current: {
    node: StoryAsset["graph"]["nodes"][number] | null;
    stage: StoryAsset["graph"]["stages"][number] | null;
    scene: StoryAsset["scenes"][number] | null;
    progress: string;
  };
  branch: {
    pathNodeIds: string[];
    pathEdgeIds: string[];
    incomingEdges: StoryAsset["graph"]["edges"];
    outgoingEdges: StoryAsset["graph"]["edges"];
  };
  world: {
    lorebookEntries: StoryAsset["lorebookEntries"];
  };
  characters: StoryAsset["characters"];
  memory: {
    acceptedManuscripts: StoryAcceptedManuscript[];
    characterPublicMemories: Array<{
      characterId: string;
      name: string;
      memory: string;
    }>;
  };
};

const compact = (value: string | undefined | null) => value?.trim() ?? "";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const getNode = (story: StoryAsset, nodeId: string) =>
  story.graph.nodes.find((node) => node.id === nodeId) ??
  story.graph.nodes.find((node) => node.id === story.graph.activeNodeId) ??
  story.graph.nodes.find((node) => node.id === story.graph.entryNodeId) ??
  story.graph.nodes[0] ??
  null;

const getSceneForNode = (
  story: StoryAsset,
  node: StoryAsset["graph"]["nodes"][number] | null,
) => node?.sceneId
  ? story.scenes.find((scene) => scene.id === node.sceneId) ?? null
  : null;

const createDataPackage = ({
  story,
  scope,
  activeNodeId,
  pathNodeIds = [],
  pathEdgeIds = [],
}: {
  story: StoryAsset;
  scope: StoryDataPackageScope;
  activeNodeId?: string | null;
  pathNodeIds?: string[];
  pathEdgeIds?: string[];
}): StoryDataPackage => {
  const node = getNode(story, compact(activeNodeId));
  const nodeId = node?.id ?? "";
  const stage = node
    ? story.graph.stages.find((item) => item.id === node.stageId) ?? null
    : null;
  const scene = getSceneForNode(story, node);
  const normalizedPathNodeIds = unique([
    ...pathNodeIds,
    nodeId,
  ]);
  const acceptedNodeIds = new Set(normalizedPathNodeIds);
  const acceptedManuscripts = story.manuscriptInbox.accepted.filter((item) =>
    acceptedNodeIds.size === 0 || acceptedNodeIds.has(item.nodeId)
  );
  const progress = [
    scene?.plot,
    ...acceptedManuscripts.map((item) => item.summary || item.content),
  ].map(compact).filter(Boolean).join("\n\n");

  return {
    version: 1,
    scope,
    storyId: story.id,
    nodeId,
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
      pathNodeIds: normalizedPathNodeIds,
      pathEdgeIds: unique(pathEdgeIds),
      incomingEdges: story.graph.edges.filter((edge) => edge.toNodeId === nodeId),
      outgoingEdges: story.graph.edges.filter((edge) => edge.fromNodeId === nodeId),
    },
    world: {
      lorebookEntries: story.lorebookEntries,
    },
    characters: story.characters,
    memory: {
      acceptedManuscripts,
      characterPublicMemories: story.characters.flatMap((character) => {
        const memory = compact(character.memory?.public);
        return memory
          ? [{
              characterId: character.id,
              name: character.name,
              memory,
            }]
          : [];
      }),
    },
  };
};

export const getStoryNodeDataPackage = (
  story: StoryAsset,
  {
    nodeId,
  }: {
    nodeId?: string | null;
  } = {},
) => createDataPackage({
  story,
  scope: "node",
  activeNodeId: nodeId,
});

export const getStoryBranchDataPackage = (
  story: StoryAsset,
  {
    activeNodeId,
    pathNodeIds = [],
    pathEdgeIds = [],
  }: {
    activeNodeId?: string | null;
    pathNodeIds?: string[];
    pathEdgeIds?: string[];
  } = {},
) => {
  const context = buildStoryContextPackageFromAsset(story, {
    activeNodeId: activeNodeId ?? pathNodeIds.at(-1),
    branch: {
      pathNodeIds,
      pathEdgeIds,
    },
  });

  return createDataPackage({
    story,
    scope: "branch",
    activeNodeId: context.graph.activeNode?.id ?? activeNodeId,
    pathNodeIds: context.branch.pathNodeIds,
    pathEdgeIds: context.branch.pathEdgeIds,
  });
};
