import type { StoryTypeDefinition } from "../../definitions/types.js";
import type {
  StoryChangeSetDescription,
  StoryContext,
  StoryDocument,
  StoryOverview,
  StoryProjectState,
  StoryProjectStructure,
} from "../../types.js";
import { readStoryProjectContext } from "./context.js";
import { describeStoryProject } from "./description.js";
import { editableStoryDocument } from "./document.js";
import { projectOverview } from "./overview.js";

/** 应用层读取模型的统一入口；所有方法都是无 I/O 的纯投影。 */
export interface StoryProjectQueryApi {
  describe(
    definition: StoryTypeDefinition,
    changeSet: StoryChangeSetDescription,
    input?: Readonly<{ documentKinds?: readonly string[] }>,
  ): StoryProjectStructure;
  overview(project: StoryProjectState, definition: StoryTypeDefinition): StoryOverview;
  document(
    definition: StoryTypeDefinition,
    document: Pick<StoryDocument, "ref" | "value" | "updatedAt">,
  ): StoryDocument;
  context(
    project: StoryProjectState,
    definition: StoryTypeDefinition,
    input: Readonly<{ scope: "project" | "chapter"; targetId?: string }>,
  ): StoryContext;
}

export const StoryProjectQuery: StoryProjectQueryApi = Object.freeze({
  describe: describeStoryProject,
  overview: projectOverview,
  document: editableStoryDocument,
  context: readStoryProjectContext,
});
