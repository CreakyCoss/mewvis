import {
  createEmptyStoryManuscriptInbox,
  submitStoryManuscriptDraft,
  type StoryManuscriptSubmissionInput,
} from "../modules/manuscripts/manuscript-inbox";
import type { StoryJson } from "./types";
export type { StoryJson } from "./types";

export const createStandaloneStoryJson = ({
  id = `story-${crypto.randomUUID()}`,
  title = "未命名故事",
  timestamp = Date.now(),
}: {
  id?: string;
  title?: string;
  timestamp?: number;
}): StoryJson => {
  const sceneId = `${id}-scene-main`;
  const stageId = `${id}-stage-main`;
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
      stages: [
        {
          id: stageId,
          title: "起始阶段",
          order: 0,
        },
      ],
      nodes: [
        {
          id: nodeId,
          stageId,
          sceneId,
          title: "起始节点",
          type: "normal",
          pathRole: "main",
          status: "draft",
        },
      ],
      edges: [],
    },
    manuscriptInbox: createEmptyStoryManuscriptInbox(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const submitStoryManuscriptToStory = (
  story: StoryJson,
  input: StoryManuscriptSubmissionInput,
  {
    timestamp = Date.now(),
  }: {
    timestamp?: number;
  } = {},
) => {
  if (story.id !== input.storyId) {
    throw new Error("找不到要收稿的故事。");
  }
  if (!story.graph.nodes.some((node) => node.id === input.nodeId)) {
    throw new Error("找不到稿件绑定的故事节点。");
  }

  const { draft, inbox } = submitStoryManuscriptDraft(story.manuscriptInbox, {
    ...input,
    createdAt: input.createdAt ?? timestamp,
  });
  const nextStory: StoryJson = {
    ...story,
    manuscriptInbox: inbox,
    updatedAt: timestamp,
  };

  return {
    draft,
    story: nextStory,
  };
};
