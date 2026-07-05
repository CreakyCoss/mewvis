import { normalizeTavernAvatarId } from "@/assets/avatars";
import { createEmptyStoryManuscriptInbox, type StoryManuscriptInbox } from "../modules/manuscripts/manuscript-inbox";
import type {
  StoryCharacterJson,
  StoryCharacterMemoryJson,
  StoryEdgeJson,
  StoryGraphJson,
  StoryJson,
  StoryLorebookEntryJson,
  StoryNodeJson,
  StorySceneJson,
  StorySceneStatusJson,
  StoryStageJson,
} from "./types";

export type NormalizeStoryJsonOptions = {
  id?: string;
  title?: string;
  timestamp?: number;
};

const trimText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const text = trimText(item);
        return text ? [text] : [];
      })
    : [];

const numberValue = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeCharacterMemory = (value: unknown): StoryCharacterMemoryJson | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    required: trimText(value.required),
    public: trimText(value.public),
    known: trimText(value.known),
    privateSelf: trimText(value.privateSelf),
    directorSecret: trimText(value.directorSecret),
  };
};

const normalizeCharacter = (value: unknown, index: number): StoryCharacterJson | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = trimText(value.id) || `character-${index + 1}`;
  const description = trimText(value.description);
  const speakingStyle = trimText(value.speakingStyle);
  const rawName = trimText(value.name);
  if (!description && !speakingStyle && !rawName) {
    return null;
  }

  return {
    id,
    name: rawName || `角色 ${index + 1}`,
    avatar: normalizeTavernAvatarId(trimText(value.avatar) || undefined),
    description,
    speakingStyle: speakingStyle || "自然回应，保持人设一致。",
    writingStyle: trimText(value.writingStyle) || undefined,
    replyStylePrompt: trimText(value.replyStylePrompt) || undefined,
    goals: trimText(value.goals) || undefined,
    relationshipSummary: trimText(value.relationshipSummary) || undefined,
    publicRelationshipSummary: trimText(value.publicRelationshipSummary) || undefined,
    memory: normalizeCharacterMemory(value.memory),
  };
};

const normalizeLorebookEntry = (value: unknown, index: number): StoryLorebookEntryJson | null => {
  if (!isRecord(value)) {
    return null;
  }

  const content = trimText(value.content);
  if (!content) {
    return null;
  }

  return {
    id: trimText(value.id) || `lore-${index + 1}`,
    title: trimText(value.title) || `世界书 ${index + 1}`,
    content,
    keywords: stringArray(value.keywords),
    enabled: value.enabled !== false,
    alwaysOn: value.alwaysOn === true,
  };
};

const normalizeSceneStatus = (value: unknown): StorySceneStatusJson | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const status: StorySceneStatusJson = {
    location: trimText(value.location) || undefined,
    timeLabel: trimText(value.timeLabel) || undefined,
    weather: trimText(value.weather) || undefined,
    atmosphere: trimText(value.atmosphere) || undefined,
    scenePhase: trimText(value.scenePhase) || undefined,
    immediateThreat: trimText(value.immediateThreat) || undefined,
  };
  return Object.values(status).some(Boolean) ? status : undefined;
};

const normalizeScene = (value: unknown, index: number): StorySceneJson | null => {
  if (!isRecord(value)) {
    return null;
  }

  const scene = trimText(value.scene);
  const goal = trimText(value.goal);
  const plot = trimText(value.plot);
  const rawTitle = trimText(value.title);
  if (!scene && !goal && !plot && !rawTitle) {
    return null;
  }

  return {
    id: trimText(value.id) || `scene-${index + 1}`,
    title: rawTitle || `场景 ${index + 1}`,
    scene,
    goal,
    plot,
    direction: trimText(value.direction),
    transition: trimText(value.transition),
    memory: trimText(value.memory),
    status: normalizeSceneStatus(value.status),
  };
};

const normalizeStage = (value: unknown, index: number): StoryStageJson | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: trimText(value.id) || `stage-${index + 1}`,
    title: trimText(value.title) || `阶段 ${index + 1}`,
    summary: trimText(value.summary) || undefined,
    order: numberValue(value.order, index),
  };
};

const normalizeNode = (
  value: unknown,
  index: number,
  fallbackStageId: string,
  fallbackSceneId?: string,
): StoryNodeJson | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: trimText(value.id) || `node-${index + 1}`,
    stageId: trimText(value.stageId) || fallbackStageId,
    sceneId: trimText(value.sceneId) || fallbackSceneId,
    title: trimText(value.title) || `节点 ${index + 1}`,
    type: trimText(value.type) || "normal",
    pathRole: trimText(value.pathRole) || "main",
    status: trimText(value.status) || "draft",
  };
};

const normalizeEdge = (value: unknown, index: number): StoryEdgeJson | null => {
  if (!isRecord(value)) {
    return null;
  }

  const fromNodeId = trimText(value.fromNodeId);
  const toNodeId = trimText(value.toNodeId);
  if (!fromNodeId || !toNodeId) {
    return null;
  }

  return {
    id: trimText(value.id) || `edge-${index + 1}`,
    fromNodeId,
    toNodeId,
    label: trimText(value.label),
    reason: trimText(value.reason) || undefined,
    isDefault: value.isDefault === true,
    priority: numberValue(value.priority, index),
  };
};

const createFallbackGraph = ({ storyId, scenes }: { storyId: string; scenes: StorySceneJson[] }): StoryGraphJson => {
  const stageId = `${storyId}-stage-main`;
  const nodeId = `${storyId}-node-main`;
  return {
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
        sceneId: scenes[0]?.id,
        title: "起始节点",
        type: "normal",
        pathRole: "main",
        status: "draft",
      },
    ],
    edges: [],
  };
};

const normalizeGraph = ({
  value,
  storyId,
  scenes,
}: {
  value: unknown;
  storyId: string;
  scenes: StorySceneJson[];
}): StoryGraphJson => {
  if (!isRecord(value)) {
    return createFallbackGraph({ storyId, scenes });
  }

  const fallback = createFallbackGraph({ storyId, scenes });
  const stages = Array.isArray(value.stages)
    ? value.stages.flatMap((stage, index) => {
        const normalized = normalizeStage(stage, index);
        return normalized ? [normalized] : [];
      })
    : [];
  const resolvedStages = stages.length > 0 ? stages : fallback.stages;
  const fallbackStageId = resolvedStages[0]?.id ?? fallback.stages[0].id;
  const nodes = Array.isArray(value.nodes)
    ? value.nodes.flatMap((node, index) => {
        const normalized = normalizeNode(node, index, fallbackStageId, scenes[index]?.id ?? scenes[0]?.id);
        return normalized ? [normalized] : [];
      })
    : [];
  const resolvedNodes = nodes.length > 0 ? nodes : fallback.nodes;
  const nodeIds = new Set(resolvedNodes.map((node) => node.id));
  const edges = Array.isArray(value.edges)
    ? value.edges.flatMap((edge, index) => {
        const normalized = normalizeEdge(edge, index);
        return normalized && nodeIds.has(normalized.fromNodeId) && nodeIds.has(normalized.toNodeId) ? [normalized] : [];
      })
    : [];
  const entryNodeId = nodeIds.has(trimText(value.entryNodeId))
    ? trimText(value.entryNodeId)
    : (resolvedNodes[0]?.id ?? fallback.entryNodeId);
  const activeNodeId = nodeIds.has(trimText(value.activeNodeId)) ? trimText(value.activeNodeId) : entryNodeId;

  return {
    entryNodeId,
    activeNodeId,
    stages: resolvedStages,
    nodes: resolvedNodes,
    edges,
  };
};

const normalizeManuscriptInbox = (value: unknown): StoryManuscriptInbox =>
  isRecord(value) && value.version === 1 ? (value as StoryManuscriptInbox) : createEmptyStoryManuscriptInbox();

export const normalizeStoryJson = (value: unknown, options: NormalizeStoryJsonOptions = {}): StoryJson | null => {
  if (!isRecord(value)) {
    return null;
  }

  const timestamp = options.timestamp ?? Date.now();
  const id = trimText(options.id) || trimText(value.id) || createId("story");
  const title = trimText(value.title) || trimText(value.name) || trimText(options.title) || "未命名故事";
  const createdAt = numberValue(value.createdAt, timestamp);
  const updatedAt = numberValue(value.updatedAt, timestamp);
  const world = isRecord(value.world) ? value.world : {};
  const lorebookInput = Array.isArray(value.lorebookEntries)
    ? value.lorebookEntries
    : Array.isArray(world.lorebookEntries)
      ? world.lorebookEntries
      : [];
  const scenes = Array.isArray(value.scenes)
    ? value.scenes.flatMap((scene, index) => {
        const normalized = normalizeScene(scene, index);
        return normalized ? [normalized] : [];
      })
    : [];
  const resolvedScenes =
    scenes.length > 0
      ? scenes
      : [
          {
            id: `${id}-scene-main`,
            title: "起始场景",
            scene: trimText(value.outline),
            goal: trimText(value.goal),
            plot: "",
            direction: "",
            transition: "",
            memory: "",
          },
        ];

  return {
    version: 1,
    id,
    title,
    outline: trimText(value.outline),
    goal: trimText(value.goal),
    userPersonaName: trimText(value.userPersonaName) || "我",
    characters: Array.isArray(value.characters)
      ? value.characters.flatMap((character, index) => {
          const normalized = normalizeCharacter(character, index);
          return normalized ? [normalized] : [];
        })
      : [],
    lorebookEntries: lorebookInput.flatMap((entry, index) => {
      const normalized = normalizeLorebookEntry(entry, index);
      return normalized ? [normalized] : [];
    }),
    scenes: resolvedScenes,
    graph: normalizeGraph({
      value: value.graph,
      storyId: id,
      scenes: resolvedScenes,
    }),
    manuscriptInbox: normalizeManuscriptInbox(value.manuscriptInbox),
    createdAt,
    updatedAt,
  };
};

export const assertStoryJsonReady = (story: StoryJson) => {
  if (!story.title.trim()) {
    throw new Error("故事缺少标题。");
  }
  if (story.scenes.length === 0) {
    throw new Error("故事至少需要一个场景。");
  }
  if (story.graph.nodes.length === 0) {
    throw new Error("故事至少需要一个节点。");
  }
};
