import {
  createEmptyStoryManuscriptInbox,
  type StoryManuscriptInbox,
} from "./manuscript-inbox";
import type {
  StoryContextCharacter,
  StoryContextEdge,
  StoryContextLorebookEntry,
  StoryContextNode,
  StoryContextScene,
  StoryContextStage,
} from "./context-package";
import {
  createEmptyStoryState,
  type StoryAsset,
  type StoryState,
} from "./state";

const trimText = (value: unknown) => typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeStoryAsset = (
  value: unknown,
): StoryAsset | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = trimText(value.id);
  const workspaceId = trimText(value.workspaceId);
  const title = trimText(value.title);
  if (!id || !workspaceId || !title) {
    return null;
  }
  if (
    !Array.isArray(value.characters) ||
    !Array.isArray(value.lorebookEntries) ||
    !Array.isArray(value.scenes) ||
    !isRecord(value.graph) ||
    !Array.isArray(value.graph.stages) ||
    !Array.isArray(value.graph.nodes) ||
    !Array.isArray(value.graph.edges)
  ) {
    return null;
  }

  return {
    id,
    workspaceId,
    title,
    outline: trimText(value.outline),
    goal: trimText(value.goal),
    userPersonaName: trimText(value.userPersonaName) || "我",
    characters: value.characters as StoryContextCharacter[],
    lorebookEntries: value.lorebookEntries as StoryContextLorebookEntry[],
    scenes: value.scenes as StoryContextScene[],
    graph: {
      entryNodeId: trimText(value.graph.entryNodeId),
      activeNodeId: trimText(value.graph.activeNodeId),
      stages: value.graph.stages as StoryContextStage[],
      nodes: value.graph.nodes as StoryContextNode[],
      edges: value.graph.edges as StoryContextEdge[],
    },
    manuscriptInbox: isRecord(value.manuscriptInbox) && value.manuscriptInbox.version === 1
      ? value.manuscriptInbox as StoryManuscriptInbox
      : createEmptyStoryManuscriptInbox(),
    sourceRefs: Array.isArray(value.sourceRefs)
      ? value.sourceRefs.flatMap((ref) => {
          if (!isRecord(ref)) {
            return [];
          }
          const channel = trimText(ref.channel);
          const refId = trimText(ref.id);
          if (!channel || !refId) {
            return [];
          }
          const label = trimText(ref.label);
          return [{
            channel,
            id: refId,
            label: label || undefined,
          }];
        })
      : [],
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
};

export const normalizeStoryState = (
  workspaceId: string,
  value: unknown,
): StoryState | null => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.stories)) {
    return null;
  }

  const stories = value.stories
    .flatMap((story) => {
      const normalized = normalizeStoryAsset(story);
      return normalized?.workspaceId === workspaceId ? [normalized] : [];
    });

  if (stories.length === 0) {
    return createEmptyStoryState();
  }

  const activeStoryId = stories.some((story) => story.id === value.activeStoryId)
    ? trimText(value.activeStoryId)
    : stories[0]?.id ?? "";

  return {
    version: 1,
    activeStoryId,
    stories,
  };
};
