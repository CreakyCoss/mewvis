import { defaultTavernAvatar, tavernAvatarOptions } from "@/assets/avatars";
import type {
  StoryCharacterJson,
  StoryEdgeJson,
  StoryGraphJson,
  StoryJson,
  StoryLorebookEntryJson,
  StoryNodeJson,
  StorySceneJson,
  StorySceneStatusJson,
} from "./types";

type CreateStorySceneOptions = Partial<StorySceneJson> & {
  includeStatus?: boolean;
};

export const createStoryLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getDefaultTavernAvatarId = (index = 0) =>
  tavernAvatarOptions[Math.abs(index) % tavernAvatarOptions.length]?.id ?? defaultTavernAvatar.id;

export const emptyCharacterMemory = (): NonNullable<StoryCharacterJson["memory"]> => ({
  required: "",
  public: "",
  known: "",
  privateSelf: "",
  directorSecret: "",
});

export const emptySceneStatus = (): StorySceneStatusJson => ({
  location: "",
  timeLabel: "",
  weather: "",
  atmosphere: "",
  scenePhase: "",
  immediateThreat: "",
});

export const createStoryCharacter = (
  index: number,
  overrides: Partial<StoryCharacterJson> = {},
): StoryCharacterJson => {
  const { id, memory, ...restOverrides } = overrides;

  return {
    id: id ?? createStoryLocalId("story-character"),
    name: `角色 ${index + 1}`,
    avatar: getDefaultTavernAvatarId(index),
    description: "",
    speakingStyle: "自然回应，保持人设一致。",
    writingStyle: "",
    replyStylePrompt: "",
    goals: "",
    relationshipSummary: "",
    publicRelationshipSummary: "",
    ...restOverrides,
    memory: {
      ...emptyCharacterMemory(),
      ...memory,
    },
  };
};

export const createStoryScene = (index: number, options: CreateStorySceneOptions = {}): StorySceneJson => {
  const { includeStatus = true, id, ...overrides } = options;

  return {
    id: id ?? createStoryLocalId("story-scene"),
    title: `场景 ${index + 1}`,
    scene: "",
    goal: "",
    plot: "",
    direction: "",
    transition: "",
    memory: "",
    ...(includeStatus ? { status: emptySceneStatus() } : {}),
    ...overrides,
  };
};

export const createStoryLorebookEntry = (
  index: number,
  overrides: Partial<StoryLorebookEntryJson> = {},
): StoryLorebookEntryJson => {
  const { id, ...restOverrides } = overrides;

  return {
    id: id ?? createStoryLocalId("story-lore"),
    title: `世界书 ${index + 1}`,
    content: "",
    keywords: [],
    enabled: true,
    alwaysOn: false,
    ...restOverrides,
  };
};

export const createStoryNode = (
  story: Pick<StoryJson, "scenes" | "graph">,
  overrides: Partial<StoryNodeJson> = {},
): StoryNodeJson => {
  const { id, ...restOverrides } = overrides;
  const scene = story.scenes[0];
  return {
    id: id ?? createStoryLocalId("story-node"),
    sceneId: scene?.id,
    title: `节点 ${story.graph.nodes.length + 1}`,
    type: "normal",
    pathRole: "main",
    status: "draft",
    ...restOverrides,
  };
};

export const createStoryEdge = (
  story: Pick<StoryJson, "graph">,
  overrides: Partial<StoryEdgeJson> = {},
): StoryEdgeJson | null => {
  const { id, fromNodeId: overrideFromNodeId, toNodeId: overrideToNodeId, ...restOverrides } = overrides;
  const [fromNode, toNode] = story.graph.nodes;
  const fromNodeId = overrideFromNodeId ?? fromNode?.id;
  const toNodeId = overrideToNodeId ?? toNode?.id;
  if (!fromNodeId || !toNodeId) {
    return null;
  }

  return {
    id: id ?? createStoryLocalId("story-edge"),
    fromNodeId,
    toNodeId,
    label: "分支",
    reason: "",
    isDefault: false,
    priority: story.graph.edges.length,
    ...restOverrides,
  };
};

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
  const scene = createStoryScene(0, {
    id: sceneId,
    title: "起始场景",
    includeStatus: false,
  });
  const graphSeed: StoryGraphJson = {
    nodes: [],
    edges: [],
  };
  const node = createStoryNode(
    {
      scenes: [scene],
      graph: graphSeed,
    },
    {
      id: nodeId,
      sceneId,
      title: "起始节点",
    },
  );

  return {
    id,
    title: title.trim() || "未命名故事",
    premise: "",
    goal: "",
    playerName: "我",
    characters: [],
    lorebookEntries: [],
    scenes: [scene],
    graph: {
      ...graphSeed,
      nodes: [node],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
