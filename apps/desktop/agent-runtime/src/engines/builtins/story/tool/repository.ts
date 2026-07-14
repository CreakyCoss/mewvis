import type { StoryProjectApi } from "../../../../../../core/story-project/api.js";

type StoryCompiledProject = ReturnType<StoryProjectApi["createProject"]>;

/** Story Tool persistence port; agent drivers do not depend on a frontend filesystem implementation. */
export interface StoryToolRepository {
  loadProjectApi(): Promise<StoryProjectApi>;
  inspect(projectApi: StoryProjectApi): Promise<{ initialized: boolean; jsonPaths: string[] }>;
  load(projectApi: StoryProjectApi): Promise<StoryCompiledProject>;
  initialize(projectApi: StoryProjectApi, project: StoryCompiledProject, replaceExistingJson: boolean): Promise<void>;
  writeChanges(projectApi: StoryProjectApi, project: StoryCompiledProject, changedPaths: string[]): Promise<void>;
}
