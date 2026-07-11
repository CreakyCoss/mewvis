import type { StoryProject } from "./schema.js";

/**
 * Persistence port for the optional Story Project capability.
 * Agent drivers depend on this interface, not on a desktop/frontend filesystem implementation.
 */
export interface StoryProjectRepository {
  inspect(): Promise<{ initialized: boolean; jsonPaths: string[] }>;
  load(): Promise<StoryProject>;
  initialize(project: StoryProject, replaceExistingJson: boolean): Promise<void>;
  writeChanges(project: StoryProject, changedPaths: string[]): Promise<void>;
}
