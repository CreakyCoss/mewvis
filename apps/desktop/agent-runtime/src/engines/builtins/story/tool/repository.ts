import type { CompiledStoryContract, StoryCompiledProject } from "../../../../../../protocols/story-project/index.js";

/**
 * Persistence port for the optional Story Project capability.
 * Agent drivers depend on this interface, not on a desktop/frontend filesystem implementation.
 */
export interface StoryToolRepository {
  loadContract(): Promise<CompiledStoryContract>;
  inspect(contract: CompiledStoryContract): Promise<{ initialized: boolean; jsonPaths: string[] }>;
  load(contract: CompiledStoryContract): Promise<StoryCompiledProject>;
  initialize(
    contract: CompiledStoryContract,
    project: StoryCompiledProject,
    replaceExistingJson: boolean,
  ): Promise<void>;
  writeChanges(contract: CompiledStoryContract, project: StoryCompiledProject, changedPaths: string[]): Promise<void>;
}
