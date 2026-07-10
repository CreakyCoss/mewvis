import type { StoryCharacterJson, StoryJson, StoryLorebookEntryJson, StoryNodeJson, StorySceneJson } from "./types";

export type StoryNodeScene = {
  id: string;
  title: string;
  premise: string;
  goal: string;
  playerName: string;
  node: StoryNodeJson;
  scene: StorySceneJson;
  characters: StoryCharacterJson[];
  lorebookEntries: StoryLorebookEntryJson[];
};

export const buildStoryNodeScene = (story: StoryJson, nodeId: string): StoryNodeScene => {
  const node = story.graph.nodes.find((item) => item.id === nodeId);
  if (!node) {
    throw new Error(`Story node not found: ${nodeId}`);
  }

  const scene = story.scenes.find((item) => item.id === node.sceneId);
  if (!scene) {
    throw new Error(`Story scene not found for node: ${node.id}`);
  }

  return {
    id: story.id,
    title: story.title,
    premise: story.premise,
    goal: story.goal,
    playerName: story.playerName,
    node,
    scene,
    characters: story.characters,
    lorebookEntries: story.lorebookEntries,
  };
};
