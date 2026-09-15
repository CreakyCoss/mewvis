import { LONG_NOVEL_STORY_TYPE } from "./long-novel/index.js";
import { SHORT_NOVEL_STORY_TYPE } from "./short-novel/index.js";
import type { StoryTypeDefinition, StoryTypeSummary } from "../definitions/types.js";
import type { StoryFileStorageBinding } from "../storage/types.js";
import type { StoryTypeOptions } from "./types.js";

const STORY_TYPES = Object.freeze([LONG_NOVEL_STORY_TYPE, SHORT_NOVEL_STORY_TYPE]);
const STORY_TYPES_BY_ID = new Map(STORY_TYPES.map((storyType) => [storyType.definition.id, storyType]));

const storyTypeOptions = (id: string, version?: number): StoryTypeOptions => {
  const storyType = STORY_TYPES_BY_ID.get(id);
  if (!storyType || (version !== undefined && storyType.definition.version !== version)) {
    throw new Error(`未知故事类型：${id}${version === undefined ? "" : `@${version}`}`);
  }
  return storyType;
};

export const listStoryTypes = (): readonly StoryTypeSummary[] =>
  STORY_TYPES.map(({ definition: { id, version, label, description } }) => ({ id, version, label, description }));

export const resolveStoryType = (id: string, version?: number): StoryTypeDefinition =>
  storyTypeOptions(id, version).definition;

/** 将完整 Story Type options 收敛为 File Storage 所需的绑定。 */
export const storyFileStorageBindings = (): readonly StoryFileStorageBinding[] =>
  STORY_TYPES.map(({ definition, storage }) => ({ definition, layout: storage.file.layout }));
