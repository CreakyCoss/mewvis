import type {
  StoryJson,
  StoryCharacterJson,
  StoryEdgeJson,
  StoryLorebookEntryJson,
  StoryNodeJson,
  StorySceneJson,
  StoryStageJson,
} from "../story/model/types";
import { defaultTavernAvatar, tavernAvatarOptions } from "@/assets/avatars";

export type StoryDraft = Pick<StoryJson, "title" | "outline" | "goal" | "userPersonaName">;

export const formatCount = (count: number, label: string) => `${count} ${label}`;

export const splitKeywords = (value: string) =>
  value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);

const createStoryLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getDefaultTavernAvatarId = (index = 0) =>
  tavernAvatarOptions[Math.abs(index) % tavernAvatarOptions.length]?.id ?? defaultTavernAvatar.id;

export const emptyCharacterMemory = (): NonNullable<StoryCharacterJson["memory"]> => ({
  required: "",
  public: "",
  known: "",
  privateSelf: "",
  directorSecret: "",
});

export const createStoryCharacter = (index: number): StoryCharacterJson => ({
  id: createStoryLocalId("story-character"),
  name: `角色 ${index + 1}`,
  avatar: getDefaultTavernAvatarId(index),
  description: "",
  speakingStyle: "自然回应，保持人设一致。",
  writingStyle: "",
  replyStylePrompt: "",
  goals: "",
  relationshipSummary: "",
  publicRelationshipSummary: "",
  memory: emptyCharacterMemory(),
});

export const createStoryScene = (index: number): StorySceneJson => ({
  id: createStoryLocalId("story-scene"),
  title: `场景 ${index + 1}`,
  scene: "",
  goal: "",
  plot: "",
  direction: "",
  transition: "",
  memory: "",
  status: {
    location: "",
    timeLabel: "",
    weather: "",
    atmosphere: "",
    scenePhase: "",
    immediateThreat: "",
  },
});

export const createStoryLorebookEntry = (index: number): StoryLorebookEntryJson => ({
  id: createStoryLocalId("story-lore"),
  title: `世界书 ${index + 1}`,
  content: "",
  keywords: [],
  enabled: true,
  alwaysOn: false,
});

export const createStoryStage = (index: number): StoryStageJson => ({
  id: createStoryLocalId("story-stage"),
  title: `阶段 ${index + 1}`,
  summary: "",
  order: index,
});

export const createStoryNode = (story: StoryJson): StoryNodeJson => {
  const stage = story.graph.stages[0] ?? createStoryStage(0);
  const scene = story.scenes[0];
  return {
    id: createStoryLocalId("story-node"),
    stageId: stage.id,
    sceneId: scene?.id,
    title: `节点 ${story.graph.nodes.length + 1}`,
    type: "normal",
    pathRole: "main",
    status: "draft",
  };
};

export const createStoryEdge = (story: StoryJson): StoryEdgeJson | null => {
  const [fromNode, toNode] = story.graph.nodes;
  if (!fromNode || !toNode) {
    return null;
  }

  return {
    id: createStoryLocalId("story-edge"),
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    label: "分支",
    reason: "",
    isDefault: false,
    priority: story.graph.edges.length,
  };
};

export const moveItem = <T>(items: T[], index: number, direction: -1 | 1) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
};
