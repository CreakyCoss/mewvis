import { LONG_NOVEL_STORY_TYPE } from "./long-novel/index.js";
import { SHORT_NOVEL_STORY_TYPE } from "./short-novel/index.js";
import type { StoryProjectTypeDefinition, StoryProjectTypeSummary } from "./types.js";

const STORY_TYPES = Object.freeze([LONG_NOVEL_STORY_TYPE, SHORT_NOVEL_STORY_TYPE]);
const STORY_TYPES_BY_ID = new Map(STORY_TYPES.map((storyType) => [storyType.id, storyType]));

export const listStoryProjectTypes = (): readonly StoryProjectTypeSummary[] =>
  STORY_TYPES.map(({ id, label, description }) => ({ id, label, description }));

export const resolveStoryProjectType = (id: string): StoryProjectTypeDefinition => {
  const storyType = STORY_TYPES_BY_ID.get(id);
  if (!storyType) throw new Error(`未知故事类型：${id}`);
  return storyType;
};
