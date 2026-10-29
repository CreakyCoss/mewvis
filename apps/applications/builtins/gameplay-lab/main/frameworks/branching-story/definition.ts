import type { FrameworkDefinition } from "../contracts";
export const branchingStoryDefinition = {
  id: "branching-story",
  gameType: "narrative",
  name: "条件分支叙事",
  description: "通过选项推进剧情，检查条件并记录状态变化。",
  simulator: {
    id: "branching-narrative",
    version: 1,
  },
  schema: "gameplay-narrative-v1",
  scope:
    "提供人物、剧情、选项与状态变量结构，支持条件分支、赋值加减、人工阅读和路径回放。",
} satisfies FrameworkDefinition;
