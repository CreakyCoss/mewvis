import { createEmptyStoryManuscriptsManifest, storyManuscriptContentPath } from "../core/file-layout";
import { storyManuscriptStatusOptions, storyManuscriptStatuses, type StoryManuscriptManifestIdsKey } from "./status";
import type {
  StoryManuscript,
  StoryManuscriptMeta,
  StoryManuscriptsManifest,
  StoryManuscriptNodeSnapshot,
  StoryManuscriptSource,
  StoryManuscriptStatus,
  StoryManuscriptStorySnapshot,
} from "./types";

const manuscriptSources = new Set<StoryManuscriptSource>(["tavern", "chat", "manual", "aiPolish", "import"]);
const manuscriptStatusSet = new Set<StoryManuscriptStatus>(storyManuscriptStatuses);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const trimText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const numberValue = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const text = trimText(item);
        return text ? [text] : [];
      })
    : [];

const objectValue = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const normalizeManifestIdGroups = (node: Record<string, unknown>) =>
  Object.fromEntries(
    storyManuscriptStatusOptions.map(({ manifestIdsKey }) => [manifestIdsKey, stringArray(node[manifestIdsKey])]),
  ) as Record<StoryManuscriptManifestIdsKey, string[]>;

const normalizeStorySnapshot = (
  value: unknown,
  fallback: { storyId: string; timestamp: number },
): StoryManuscriptStorySnapshot => {
  const source = isRecord(value) ? value : {};
  return {
    id: trimText(source.id) || fallback.storyId,
    title: trimText(source.title) || "未命名故事",
    outline: trimText(source.outline),
    goal: trimText(source.goal),
    userPersonaName: trimText(source.userPersonaName) || "我",
    updatedAt: numberValue(source.updatedAt, fallback.timestamp),
  };
};

const normalizeNodeSnapshot = (value: unknown, fallback: { nodeId: string }): StoryManuscriptNodeSnapshot => {
  const source = isRecord(value) ? value : {};
  const nodeId = trimText(source.nodeId) || fallback.nodeId;
  return {
    nodeId,
    title: trimText(source.title) || nodeId,
    type: trimText(source.type) || "normal",
    pathRole: trimText(source.pathRole) || "main",
    status: trimText(source.status) || undefined,
    sceneId: trimText(source.sceneId) || undefined,
    sceneTitle: trimText(source.sceneTitle) || undefined,
    sceneSummary: trimText(source.sceneSummary) || undefined,
    sceneGoal: trimText(source.sceneGoal) || undefined,
    scenePlot: trimText(source.scenePlot) || undefined,
  };
};

export const normalizeStoryManuscriptMeta = (value: unknown): StoryManuscriptMeta | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = trimText(value.id);
  const storyId = trimText(value.storyId);
  const nodeId = trimText(value.nodeId);
  const source = trimText(value.source) as StoryManuscriptSource;
  const status = trimText(value.status) as StoryManuscriptStatus;
  const contentPath = trimText(value.contentPath);
  if (!id || !storyId || !nodeId || !manuscriptSources.has(source) || !manuscriptStatusSet.has(status)) {
    return null;
  }

  const createdAt = numberValue(value.createdAt, Date.now());
  const updatedAt = numberValue(value.updatedAt, createdAt);
  const manuscriptForPath = { id, nodeId, status };

  return {
    version: 1,
    id,
    storyId,
    nodeId,
    branchId: trimText(value.branchId) || undefined,
    status,
    source,
    sourceRunId: trimText(value.sourceRunId) || undefined,
    sourceMessageIds: stringArray(value.sourceMessageIds),
    title: trimText(value.title) || "未命名稿件",
    summary: trimText(value.summary),
    metadata: objectValue(value.metadata),
    storySnapshot: normalizeStorySnapshot(value.storySnapshot, { storyId, timestamp: updatedAt }),
    nodeSnapshot: normalizeNodeSnapshot(value.nodeSnapshot, { nodeId }),
    contentPath: contentPath || storyManuscriptContentPath(manuscriptForPath),
    createdAt,
    updatedAt,
    acceptedAt: numberValue(value.acceptedAt, 0) || undefined,
    rejectedAt: numberValue(value.rejectedAt, 0) || undefined,
  };
};

export const normalizeStoryManuscript = (metaValue: unknown, content: string): StoryManuscript | null => {
  const meta = normalizeStoryManuscriptMeta(metaValue);
  return meta
    ? {
        ...meta,
        content,
      }
    : null;
};

export const normalizeStoryManuscriptsManifest = (value: unknown, storyId: string): StoryManuscriptsManifest => {
  if (!isRecord(value) || value.version !== 1) {
    return createEmptyStoryManuscriptsManifest(storyId);
  }

  return {
    version: 1,
    storyId: trimText(value.storyId) || storyId,
    updatedAt: numberValue(value.updatedAt, Date.now()),
    nodes: Array.isArray(value.nodes)
      ? value.nodes.flatMap((node) => {
          if (!isRecord(node)) {
            return [];
          }
          const nodeId = trimText(node.nodeId);
          if (!nodeId) {
            return [];
          }
          return [
            {
              nodeId,
              nodeSnapshot: isRecord(node.nodeSnapshot) ? normalizeNodeSnapshot(node.nodeSnapshot, { nodeId }) : null,
              ...normalizeManifestIdGroups(node),
            },
          ];
        })
      : [],
  };
};
