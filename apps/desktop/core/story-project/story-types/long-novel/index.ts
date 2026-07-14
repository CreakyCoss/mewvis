import { LONG_NOVEL_LAYOUT } from "./layout.js";
import { LONG_NOVEL_PROFILE_SOURCE } from "./profile.js";
import type { StoryProjectApi } from "../../api.js";
import type { StoryCompiledProject } from "../../types.js";
import type { StoryProjectTypeDefinition } from "../types.js";

export const LONG_NOVEL_STORY_TYPE: StoryProjectTypeDefinition = Object.freeze({
  id: "long-novel",
  label: "长篇小说",
  description: "按全书大纲、分卷、章节细纲、角色状态和伏笔连续维护的长篇故事。",
  profile: LONG_NOVEL_PROFILE_SOURCE,
  layout: LONG_NOVEL_LAYOUT,
  initialize: (_projectApi: StoryProjectApi, project: StoryCompiledProject) => project,
});
