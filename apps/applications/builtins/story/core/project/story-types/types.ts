import type { StoryTypeDefinition } from "../definitions/types.js";
import type { StoryFileLayout } from "../storage/types.js";

/** 一个可直接交给 Story Project Facade 组装的完整 Story Type。 */
export type StoryTypeOptions = Readonly<{
  definition: StoryTypeDefinition;
  storage: Readonly<{
    file: Readonly<{
      layout: StoryFileLayout;
    }>;
  }>;
}>;
