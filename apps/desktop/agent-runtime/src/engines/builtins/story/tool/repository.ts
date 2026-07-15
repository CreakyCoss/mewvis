import type { StoryWorkspace } from "../../../../../../core/story-project/index.js";

/** Story Tool 只消费绑定后的标准故事工作区，不感知文件系统或故事类型实现。 */
export interface StoryToolRepository {
  readonly project: StoryWorkspace;
}
