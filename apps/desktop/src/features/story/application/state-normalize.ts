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
import { resolveStoryCharacterAvatar } from "./character-avatar";
import {
  createEmptyStoryState,
  type StoryAsset,
  type StoryState,
} from "./state";

const trimText = (value: unknown) => typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeStoryCharacterMemory = (
  value: unknown,
): StoryContextCharacter["memory"] => {
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

const normalizeStoryCharacter = (
  value: unknown,
  index: number,
): StoryContextCharacter | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = trimText(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    name: trimText(value.name) || `角色 ${index + 1}`,
    avatar: resolveStoryCharacterAvatar({
      avatar: value.avatar,
      characterId: id,
      index,
    }),
    description: trimText(value.description),
    speakingStyle: trimText(value.speakingStyle) || "自然回应，保持人设一致。",
    writingStyle: trimText(value.writingStyle) || undefined,
    replyStylePrompt: trimText(value.replyStylePrompt) || undefined,
    goals: trimText(value.goals) || undefined,
    relationshipSummary: trimText(value.relationshipSummary) || undefined,
    publicRelationshipSummary: trimText(value.publicRelationshipSummary) || undefined,
    memory: normalizeStoryCharacterMemory(value.memory),
  };
};

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
    characters: value.characters.flatMap((character, index) => {
      const normalized = normalizeStoryCharacter(character, index);
      return normalized ? [normalized] : [];
    }),
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
