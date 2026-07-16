import { LONG_NOVEL_STORY_TYPE } from "./long-novel/index.js";
import { LONG_NOVEL_FILE_LAYOUT } from "./long-novel/file-layout.js";
import { SHORT_NOVEL_STORY_TYPE } from "./short-novel/index.js";
import type { StoryTypeDefinition, StoryTypeSummary } from "../definitions/types.js";

const STORY_TYPES = Object.freeze([LONG_NOVEL_STORY_TYPE, SHORT_NOVEL_STORY_TYPE]);
const STORY_TYPES_BY_ID = new Map(STORY_TYPES.map((storyType) => [storyType.id, storyType]));

/** Built-in Story Types 当前共用的文件存储布局；仅供 File Storage Adapter 配置。 */
export const BUILTIN_STORY_FILE_LAYOUT = LONG_NOVEL_FILE_LAYOUT;

export const listStoryTypes = (): readonly StoryTypeSummary[] =>
  STORY_TYPES.map(({ id, version, label, description }) => ({ id, version, label, description }));

export const resolveStoryType = (id: string, version?: number): StoryTypeDefinition => {
  const storyType = STORY_TYPES_BY_ID.get(id);
  if (!storyType || (version !== undefined && storyType.version !== version)) {
    throw new Error(`未知故事类型：${id}${version === undefined ? "" : `@${version}`}`);
  }
  return storyType;
};
