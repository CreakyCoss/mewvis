import type { StoryJson } from "../model/types";

export type StoryNodeSelectOption = {
  description?: string;
  id: string;
  label: string;
  meta?: string;
};

export const getDefaultNodeId = (story: StoryJson | null) =>
  story?.graph.activeNodeId || story?.graph.entryNodeId || story?.graph.nodes[0]?.id || null;

export const resolveNodeId = (story: StoryJson, nodeId?: string | null) =>
  nodeId || story.graph.activeNodeId || story.graph.entryNodeId || story.graph.nodes[0]?.id || "";
