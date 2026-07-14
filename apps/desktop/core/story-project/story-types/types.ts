import type { StoryProjectApi } from "../api.js";
import type { StoryCompiledProject } from "../types.js";

/** 前端可以选择的故事类型摘要，不暴露内部 Profile 或 Layout。 */
export type StoryProjectTypeSummary = Readonly<{
  id: string;
  label: string;
  description: string;
}>;

/** Story Project 内部使用的完整故事类型组合。 */
export type StoryProjectTypeDefinition = StoryProjectTypeSummary &
  Readonly<{
    profile: unknown;
    layout: unknown;
    initialize(projectApi: StoryProjectApi, project: StoryCompiledProject): StoryCompiledProject;
  }>;
