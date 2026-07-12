import type { StoryProjectApi, StoryCompiledProject } from "../../../../../../protocols/story-project/index.js";

/** Story Tool persistence port; agent drivers do not depend on a frontend filesystem implementation. */
export interface StoryToolRepository {
  loadProjectApi(): Promise<StoryProjectApi>;
  inspect(contract: StoryProjectApi): Promise<{ initialized: boolean; jsonPaths: string[] }>;
  load(contract: StoryProjectApi): Promise<StoryCompiledProject>;
  initialize(contract: StoryProjectApi, project: StoryCompiledProject, replaceExistingJson: boolean): Promise<void>;
  writeChanges(contract: StoryProjectApi, project: StoryCompiledProject, changedPaths: string[]): Promise<void>;
}
