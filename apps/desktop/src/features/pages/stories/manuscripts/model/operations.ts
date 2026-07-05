import type { StoryJson } from "../../story/model/types";
import type {
  StoryManuscript,
  StoryManuscriptMeta,
  StoryManuscriptsByNode,
  StoryManuscriptsManifest,
  StoryManuscriptNodeSnapshot,
  StoryManuscriptSource,
  StoryManuscriptStatus,
  StoryManuscriptStorySnapshot,
  StoryManuscriptSubmissionInput,
  StoryManuscriptUpdateInput,
} from "./types";

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const trimText = (value: string | undefined | null) => value?.trim() ?? "";

export const manuscriptSourceLabels: Record<StoryManuscriptSource, string> = {
  tavern: "酒馆",
  chat: "聊天框",
  manual: "手写",
  aiPolish: "AI 润色",
  import: "导入",
};

export const manuscriptStatusLabels: Record<StoryManuscriptStatus, string> = {
  pending: "未收稿",
  accepted: "已收稿",
  rejected: "已退回",
};

export const createStorySnapshot = (story: StoryJson): StoryManuscriptStorySnapshot => ({
  id: story.id,
  title: story.title,
  outline: story.outline,
  goal: story.goal,
  userPersonaName: story.userPersonaName,
  updatedAt: story.updatedAt,
});

export const createNodeSnapshot = (story: StoryJson, nodeId: string): StoryManuscriptNodeSnapshot => {
  const node = story.graph.nodes.find((item) => item.id === nodeId);
  if (!node) {
    throw new Error("找不到稿件绑定的故事节点。");
  }

  const scene = node.sceneId ? (story.scenes.find((item) => item.id === node.sceneId) ?? null) : null;

  return {
    nodeId: node.id,
    title: node.title,
    type: node.type,
    pathRole: node.pathRole,
    status: node.status || undefined,
    sceneId: node.sceneId,
    sceneTitle: scene?.title || undefined,
    sceneSummary: scene?.scene || undefined,
    sceneGoal: scene?.goal || undefined,
    scenePlot: scene?.plot || undefined,
  };
};

export const storyManuscriptContentPath = (manuscript: Pick<StoryManuscript, "id" | "nodeId" | "status">) =>
  `manuscripts/${manuscript.status}/${encodePathSegment(manuscript.nodeId)}/${encodePathSegment(manuscript.id)}.md`;

export const storyManuscriptMetaPath = (manuscript: Pick<StoryManuscript, "id" | "nodeId" | "status">) =>
  `manuscripts/${manuscript.status}/${encodePathSegment(manuscript.nodeId)}/${encodePathSegment(manuscript.id)}.json`;

export const createStoryManuscript = (
  story: StoryJson,
  input: StoryManuscriptSubmissionInput,
  {
    id = createId("story-manuscript"),
    timestamp = Date.now(),
  }: {
    id?: string;
    timestamp?: number;
  } = {},
): StoryManuscript => {
  const content = trimText(input.content);
  if (!content) {
    throw new Error("稿件内容不能为空。");
  }
  if (story.id !== trimText(input.storyId)) {
    throw new Error("找不到要收稿的故事。");
  }

  const createdAt = input.createdAt ?? timestamp;
  const manuscript: StoryManuscript = {
    version: 1,
    id,
    storyId: story.id,
    nodeId: trimText(input.nodeId),
    branchId: trimText(input.branchId) || undefined,
    status: "pending",
    source: input.source,
    sourceRunId: trimText(input.sourceRunId) || undefined,
    sourceMessageIds: input.sourceMessageIds ?? [],
    title: trimText(input.title) || "未命名稿件",
    summary: trimText(input.summary),
    metadata: input.metadata ?? {},
    storySnapshot: createStorySnapshot(story),
    nodeSnapshot: createNodeSnapshot(story, input.nodeId),
    contentPath: "",
    content,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    ...manuscript,
    contentPath: storyManuscriptContentPath(manuscript),
  };
};

export const updateStoryManuscript = (
  manuscript: StoryManuscript,
  input: StoryManuscriptUpdateInput,
  {
    timestamp = Date.now(),
  }: {
    timestamp?: number;
  } = {},
): StoryManuscript => {
  if (manuscript.status !== "pending") {
    throw new Error("只能编辑未收稿件。");
  }

  const nextContent = input.content === undefined ? manuscript.content : trimText(input.content);
  if (!nextContent) {
    throw new Error("稿件内容不能为空。");
  }

  const updatedAt = input.updatedAt ?? timestamp;
  return {
    ...manuscript,
    title: input.title === undefined ? manuscript.title : trimText(input.title) || "未命名稿件",
    content: nextContent,
    summary: input.summary === undefined ? manuscript.summary : trimText(input.summary),
    branchId: input.branchId === undefined ? manuscript.branchId : trimText(input.branchId) || undefined,
    metadata: input.metadata ?? manuscript.metadata,
    updatedAt,
  };
};

export const acceptStoryManuscript = (
  manuscript: StoryManuscript,
  {
    acceptedAt = Date.now(),
  }: {
    acceptedAt?: number;
  } = {},
): StoryManuscript => {
  if (manuscript.status !== "pending") {
    throw new Error("只能收取未收稿件。");
  }

  const accepted = {
    ...manuscript,
    status: "accepted" as const,
    acceptedAt,
    updatedAt: acceptedAt,
  };
  return {
    ...accepted,
    contentPath: storyManuscriptContentPath(accepted),
  };
};

export const rejectStoryManuscript = (
  manuscript: StoryManuscript,
  {
    rejectedAt = Date.now(),
  }: {
    rejectedAt?: number;
  } = {},
): StoryManuscript => {
  if (manuscript.status !== "pending") {
    throw new Error("只能退回未收稿件。");
  }

  const rejected = {
    ...manuscript,
    status: "rejected" as const,
    rejectedAt,
    updatedAt: rejectedAt,
  };
  return {
    ...rejected,
    contentPath: storyManuscriptContentPath(rejected),
  };
};

export const storyManuscriptToMeta = ({ content: _content, ...meta }: StoryManuscript): StoryManuscriptMeta => meta;

export const createEmptyStoryManuscriptsManifest = (storyId: string): StoryManuscriptsManifest => ({
  version: 1,
  storyId,
  updatedAt: Date.now(),
  nodes: [],
});

export const createStoryManuscriptsManifest = (
  storyId: string,
  manuscripts: StoryManuscript[],
): StoryManuscriptsManifest => {
  const nodesById = new Map<string, StoryManuscriptsManifest["nodes"][number]>();

  for (const manuscript of manuscripts) {
    const node =
      nodesById.get(manuscript.nodeId) ??
      ({
        nodeId: manuscript.nodeId,
        nodeSnapshot: manuscript.nodeSnapshot,
        pendingIds: [],
        acceptedIds: [],
        rejectedIds: [],
      } satisfies StoryManuscriptsManifest["nodes"][number]);
    node.nodeSnapshot = manuscript.nodeSnapshot;
    if (manuscript.status === "pending") {
      node.pendingIds.push(manuscript.id);
    } else if (manuscript.status === "accepted") {
      node.acceptedIds.push(manuscript.id);
    } else {
      node.rejectedIds.push(manuscript.id);
    }
    nodesById.set(manuscript.nodeId, node);
  }

  return {
    version: 1,
    storyId,
    updatedAt: manuscripts.reduce((latest, item) => Math.max(latest, item.updatedAt), Date.now()),
    nodes: [...nodesById.values()].sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
  };
};

export const groupStoryManuscriptsByNode = (
  story: StoryJson,
  manuscripts: StoryManuscript[],
): StoryManuscriptsByNode => {
  const grouped: StoryManuscriptsByNode = Object.fromEntries(
    story.graph.nodes.map((node) => [
      node.id,
      {
        node,
        pending: [],
        accepted: [],
        rejected: [],
      },
    ]),
  );

  for (const manuscript of manuscripts) {
    const group =
      grouped[manuscript.nodeId] ??
      (grouped[manuscript.nodeId] = {
        node: null,
        pending: [],
        accepted: [],
        rejected: [],
      });
    group[manuscript.status].push(manuscript);
  }

  for (const group of Object.values(grouped)) {
    group.pending.sort(sortNewestFirst);
    group.accepted.sort(sortNewestFirst);
    group.rejected.sort(sortNewestFirst);
  }

  return grouped;
};

export const sortNewestFirst = (left: StoryManuscript, right: StoryManuscript) =>
  right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;

const encodePathSegment = (value: string) => encodeURIComponent(value.trim() || "unknown").replace(/\./g, "%2E");
