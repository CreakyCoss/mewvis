import type { StoryJson } from "./types";

export const createDefaultStoryJson = ({
  id = `story-${crypto.randomUUID()}`,
  title = "未命名故事",
  timestamp = Date.now(),
}: {
  id?: string;
  title?: string;
  timestamp?: number;
}): StoryJson => {
  const sceneId = `${id}-scene-main`;
  const nodeId = `${id}-node-main`;

  return {
    version: 1,
    id,
    title: title.trim() || "未命名故事",
    outline: "",
    goal: "",
    userPersonaName: "我",
    characters: [],
    lorebookEntries: [],
    scenes: [
      {
        id: sceneId,
        title: "起始场景",
        scene: "",
        goal: "",
        plot: "",
        direction: "",
        transition: "",
        memory: "",
      },
    ],
    graph: {
      entryNodeId: nodeId,
      activeNodeId: nodeId,
      nodes: [
        {
          id: nodeId,
          sceneId,
          title: "起始节点",
          type: "normal",
          pathRole: "main",
          status: "draft",
        },
      ],
      edges: [],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
