import type { StoryJson } from "../../story/model/types";
import { storyManuscriptContentPath } from "./file-layout";
import { storyManuscriptStatusOptions } from "../model/status";
import type {
  StoryManuscript,
  StoryManuscriptsByNode,
  StoryManuscriptNodeSnapshot,
  StoryManuscriptSource,
  StoryManuscriptStatus,
  StoryManuscriptStorySnapshot,
  StoryManuscriptSubmissionInput,
  StoryManuscriptUpdateInput,
} from "../model/types";

export { storyManuscriptStatusLabels as manuscriptStatusLabels } from "../model/status";

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const trimText = (value: string | undefined | null) => value?.trim() ?? "";

export const manuscriptSourceLabels: Record<StoryManuscriptSource, string> = {
  tavern: "酒馆",
  chat: "聊天框",
  manual: "手写",
  aiPolish: "AI 润色",
  import: "导入",
};

export const createStorySnapshot = (story: StoryJson): StoryManuscriptStorySnapshot => ({
  id: story.id,
  title: story.title,
  premise: story.premise,
  goal: story.goal,
  playerName: story.playerName,
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

const createEmptyManuscriptStatusGroups = () =>
  Object.fromEntries(storyManuscriptStatusOptions.map(({ status }) => [status, []])) as unknown as Record<
    StoryManuscriptStatus,
    StoryManuscript[]
  >;

export const groupStoryManuscriptsByNode = (
  story: StoryJson,
  manuscripts: StoryManuscript[],
): StoryManuscriptsByNode => {
  const grouped: StoryManuscriptsByNode = Object.fromEntries(
    story.graph.nodes.map((node) => [
      node.id,
      {
        node,
        ...createEmptyManuscriptStatusGroups(),
      },
    ]),
  );

  for (const manuscript of manuscripts) {
    const group =
      grouped[manuscript.nodeId] ??
      (grouped[manuscript.nodeId] = {
        node: null,
        ...createEmptyManuscriptStatusGroups(),
      });
    group[manuscript.status].push(manuscript);
  }

  for (const group of Object.values(grouped)) {
    for (const { status } of storyManuscriptStatusOptions) {
      group[status].sort(sortNewestFirst);
    }
  }

  return grouped;
};

export const sortNewestFirst = (left: StoryManuscript, right: StoryManuscript) =>
  right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;
