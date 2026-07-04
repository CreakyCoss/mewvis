import {
  createEmptyStoryManuscriptInbox,
  submitStoryManuscriptDraft,
  type StoryManuscriptSubmissionInput,
} from "./manuscript-inbox";
import type {
  StoryJson as CanonicalStoryJson,
} from "./story-types";
export type { StoryJson } from "./story-types";

export type StoryState = {
  version: 1;
  activeStoryId: string;
  stories: CanonicalStoryJson[];
};

export const createEmptyStoryState = (): StoryState => ({
  version: 1,
  activeStoryId: "",
  stories: [],
});

export const createStandaloneStoryJson = ({
  id = `story-${crypto.randomUUID()}`,
  workspaceId,
  title = "未命名故事",
  timestamp = Date.now(),
}: {
  id?: string;
  workspaceId: string;
  title?: string;
  timestamp?: number;
}): CanonicalStoryJson => {
  const sceneId = `${id}-scene-main`;
  const stageId = `${id}-stage-main`;
  const nodeId = `${id}-node-main`;

  return {
    version: 1,
    id,
    workspaceId,
    title: title.trim() || "未命名故事",
    outline: "",
    goal: "",
    userPersonaName: "我",
    characters: [],
    lorebookEntries: [],
    scenes: [{
      id: sceneId,
      title: "起始场景",
      scene: "",
      goal: "",
      plot: "",
      direction: "",
      transition: "",
      memory: "",
    }],
    graph: {
      entryNodeId: nodeId,
      activeNodeId: nodeId,
      stages: [{
        id: stageId,
        title: "起始阶段",
        order: 0,
      }],
      nodes: [{
        id: nodeId,
        stageId,
        sceneId,
        title: "起始节点",
        type: "normal",
        pathRole: "main",
        status: "draft",
      }],
      edges: [],
    },
    manuscriptInbox: createEmptyStoryManuscriptInbox(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const upsertStoryJson = (
  state: StoryState,
  story: CanonicalStoryJson,
): StoryState => {
  const exists = state.stories.some((item) => item.id === story.id);
  const stories = exists
    ? state.stories.map((item) => item.id === story.id ? story : item)
    : [...state.stories, story];

  return {
    version: 1,
    activeStoryId: stories.some((item) => item.id === state.activeStoryId)
      ? state.activeStoryId
      : story.id,
    stories,
  };
};

export const submitStoryManuscriptToState = (
  state: StoryState,
  input: StoryManuscriptSubmissionInput,
  {
    timestamp = Date.now(),
  }: {
    timestamp?: number;
  } = {},
) => {
  const story = state.stories.find((item) => item.id === input.storyId);
  if (!story) {
    throw new Error("找不到要收稿的故事。");
  }
  if (!story.graph.nodes.some((node) => node.id === input.nodeId)) {
    throw new Error("找不到稿件绑定的故事节点。");
  }

  const { draft, inbox } = submitStoryManuscriptDraft(story.manuscriptInbox, {
    ...input,
    createdAt: input.createdAt ?? timestamp,
  });
  const nextStory: CanonicalStoryJson = {
    ...story,
    manuscriptInbox: inbox,
    updatedAt: timestamp,
  };

  return {
    draft,
    story: nextStory,
    state: upsertStoryJson(state, nextStory),
  };
};
