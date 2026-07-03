import {
  createEmptyStoryManuscriptInbox,
  submitStoryManuscriptDraft,
  type StoryManuscriptInbox,
  type StoryManuscriptSubmissionInput,
} from "./manuscript-inbox";
import {
  buildStoryContextPackage,
  type StoryContextPackage,
  type StoryContextCharacter,
  type StoryContextEdge,
  type StoryContextLorebookEntry,
  type StoryContextMemoryLayers,
  type StoryContextNode,
  type StoryContextScene,
  type StoryContextStage,
} from "./context-package";

export type StoryAsset = {
  id: string;
  workspaceId: string;
  title: string;
  outline: string;
  goal: string;
  userPersonaName: string;
  characters: StoryContextCharacter[];
  lorebookEntries: StoryContextLorebookEntry[];
  scenes: StoryContextScene[];
  graph: {
    entryNodeId: string;
    activeNodeId: string;
    stages: StoryContextStage[];
    nodes: StoryContextNode[];
    edges: StoryContextEdge[];
  };
  manuscriptInbox: StoryManuscriptInbox;
  createdAt: number;
  updatedAt: number;
};

export type StoryState = {
  version: 1;
  activeStoryId: string;
  stories: StoryAsset[];
};

export const createEmptyStoryState = (): StoryState => ({
  version: 1,
  activeStoryId: "",
  stories: [],
});

export const createStandaloneStoryAsset = ({
  id = `story-${crypto.randomUUID()}`,
  workspaceId,
  title = "未命名故事",
  timestamp = Date.now(),
}: {
  id?: string;
  workspaceId: string;
  title?: string;
  timestamp?: number;
}): StoryAsset => {
  const sceneId = `${id}-scene-main`;
  const stageId = `${id}-stage-main`;
  const nodeId = `${id}-node-main`;

  return {
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

export const createStoryAssetFromContextPackage = ({
  workspaceId,
  context,
  existing,
  timestamp = Date.now(),
}: {
  workspaceId: string;
  context: StoryContextPackage;
  existing?: StoryAsset;
  timestamp?: number;
}): StoryAsset => {
  return {
    id: context.story.id,
    workspaceId,
    title: context.story.title,
    outline: context.story.outline,
    goal: context.story.goal,
    userPersonaName: context.story.userPersonaName ?? "我",
    characters: context.characters,
    lorebookEntries: context.world.lorebookEntries,
    scenes: context.scenes,
    graph: {
      entryNodeId: context.graph.entryNodeId,
      activeNodeId: context.graph.activeNodeId,
      stages: context.graph.stages,
      nodes: context.graph.nodes,
      edges: context.graph.edges,
    },
    manuscriptInbox: existing?.manuscriptInbox ?? createEmptyStoryManuscriptInbox(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
};

export const buildStoryContextPackageFromAsset = (
  story: StoryAsset,
  overrides: {
    activeNodeId?: string;
    activeScene?: StoryContextScene;
    characters?: StoryContextCharacter[];
    memory?: {
      manual?: string;
      sceneLayers?: Partial<StoryContextMemoryLayers>;
    };
    branch?: {
      pathNodeIds?: string[];
      pathEdgeIds?: string[];
    };
  } = {},
): StoryContextPackage => buildStoryContextPackage({
  story: {
    id: story.id,
    title: story.title,
    outline: story.outline,
    goal: story.goal,
    userPersonaName: story.userPersonaName,
  },
  graph: {
    entryNodeId: story.graph.entryNodeId,
    activeNodeId: overrides.activeNodeId ?? story.graph.activeNodeId,
    stages: story.graph.stages,
    nodes: story.graph.nodes,
    edges: story.graph.edges,
  },
  scenes: story.scenes,
  activeScene: overrides.activeScene,
  lorebookEntries: story.lorebookEntries,
  characters: overrides.characters ?? story.characters,
  memory: overrides.memory,
  branch: overrides.branch,
});

export const upsertStoryAsset = (
  state: StoryState,
  story: StoryAsset,
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
  const nextStory: StoryAsset = {
    ...story,
    manuscriptInbox: inbox,
    updatedAt: timestamp,
  };

  return {
    draft,
    story: nextStory,
    state: upsertStoryAsset(state, nextStory),
  };
};
