import type {
  StoryAsset,
  StoryContextCharacter,
  StoryContextEdge,
  StoryContextLorebookEntry,
  StoryContextNode,
  StoryContextScene,
  StoryContextStage,
  StoryImportSourceKind,
  StoryManuscriptDraft,
} from "@/features/story";
import { getDefaultStoryCharacterAvatar } from "@/features/story";

export type StoryDraft = Pick<
  StoryAsset,
  "title" | "outline" | "goal" | "userPersonaName"
>;

export const formatCount = (count: number, label: string) => `${count} ${label}`;

export const splitKeywords = (value: string) =>
  value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);

export const getPendingDraftCount = (story: StoryAsset) =>
  story.manuscriptInbox.drafts.filter((draft) => draft.status === "pending").length;

const createStoryLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const emptyCharacterMemory = (): NonNullable<StoryContextCharacter["memory"]> => ({
  required: "",
  public: "",
  known: "",
  privateSelf: "",
  directorSecret: "",
});

export const createStoryCharacter = (index: number): StoryContextCharacter => ({
  id: createStoryLocalId("story-character"),
  name: `角色 ${index + 1}`,
  avatar: getDefaultStoryCharacterAvatar(index),
  description: "",
  speakingStyle: "自然回应，保持人设一致。",
  writingStyle: "",
  replyStylePrompt: "",
  goals: "",
  relationshipSummary: "",
  publicRelationshipSummary: "",
  memory: emptyCharacterMemory(),
});

export const createStoryScene = (index: number): StoryContextScene => ({
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

export const createStoryLorebookEntry = (index: number): StoryContextLorebookEntry => ({
  id: createStoryLocalId("story-lore"),
  title: `世界书 ${index + 1}`,
  content: "",
  keywords: [],
  enabled: true,
  alwaysOn: false,
});

export const createStoryStage = (index: number): StoryContextStage => ({
  id: createStoryLocalId("story-stage"),
  title: `阶段 ${index + 1}`,
  summary: "",
  order: index,
});

export const createStoryNode = (story: StoryAsset): StoryContextNode => {
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

export const createStoryEdge = (story: StoryAsset): StoryContextEdge | null => {
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

export const moveItem = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
};

export const manuscriptSourceLabels: Record<StoryManuscriptDraft["source"], string> = {
  tavern: "酒馆",
  chat: "聊天框",
  manual: "手写",
  aiPolish: "AI 润色",
  import: "导入",
};

export const storyImportSourceLabels: Record<StoryImportSourceKind, string> = {
  json: "JSON",
  plainText: "纯文本",
  aiGenerated: "AI 生成",
  characterCard: "角色卡",
  worldBook: "世界书",
  unknown: "自动",
};
