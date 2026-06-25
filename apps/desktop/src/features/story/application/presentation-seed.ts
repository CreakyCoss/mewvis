import type {
  StoryAsset,
} from "./state";

export type StoryPresentationSeed = {
  version: 1;
  story: {
    id: string;
    title: string;
    outline: string;
    goal: string;
    userPersonaName: string;
    createdAt: number;
    updatedAt: number;
  };
  graph: StoryAsset["graph"];
  scenes: StoryAsset["scenes"];
  characters: StoryAsset["characters"];
  world: {
    lorebookEntries: StoryAsset["lorebookEntries"];
  };
  targetNodeId: string;
  openingMessage: string;
};

const resolveStoryPresentationNodeId = (
  story: StoryAsset,
  nodeId?: string | null,
) => nodeId?.trim() ||
  story.graph.activeNodeId ||
  story.graph.entryNodeId ||
  story.graph.nodes[0]?.id ||
  "";

export const getStoryPresentationSeed = (
  story: StoryAsset,
  {
    nodeId,
  }: {
    nodeId?: string | null;
  } = {},
): StoryPresentationSeed => ({
  version: 1,
  story: {
    id: story.id,
    title: story.title,
    outline: story.outline,
    goal: story.goal,
    userPersonaName: story.userPersonaName,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  },
  graph: story.graph,
  scenes: story.scenes,
  characters: story.characters,
  world: {
    lorebookEntries: story.lorebookEntries,
  },
  targetNodeId: resolveStoryPresentationNodeId(story, nodeId),
  openingMessage: `已从故事「${story.title}」创建呈现。`,
});
