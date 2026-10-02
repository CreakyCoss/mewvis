import type { StoryProjectApi, StoryWorkspace } from "@story/project";
import { listStoryTypes } from "@story/project/story-types";
import { call, workspaceForPath } from "@/platform/bridge";

/** Keep the original project facade; only transport crosses the application boundary. */
const request = async <T>(path: string, action: string, input?: unknown): Promise<T> => {
  const workspace = await workspaceForPath(path);
  return call<T>("mewvis_story_project", { workspaceId: workspace.id, action, ...(input === undefined ? {} : { input }) });
};
const workspace = (projectKey: string): StoryWorkspace => ({
  projectKey,
  initialize: input => request(projectKey, "initialize", input),
  describe: input => request(projectKey, "describe", input),
  overview: () => request(projectKey, "overview"),
  listDocuments: input => request(projectKey, "listDocuments", input),
  saveDocument: input => request(projectKey, "saveDocument", input),
  removeDocument: input => request(projectKey, "removeDocument", input),
  readContext: input => request(projectKey, "readContext", input),
  validateChanges: input => request(projectKey, "validateChanges", input),
  commitChanges: input => request(projectKey, "commitChanges", input),
});
export const storyProjectApi: StoryProjectApi = {
  listStoryTypes,
  checkCompatibility: path => request(path, "checkCompatibility"),
  upgrade: path => request(path, "upgrade"),
  workspace,
  async open(path) { await request(path, "open"); return workspace(path); },
  async create(path, input) { await request(path, "create", input); return workspace(path); },
};
