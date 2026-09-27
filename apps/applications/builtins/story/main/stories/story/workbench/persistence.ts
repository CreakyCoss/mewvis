import type { StoryWorkspace } from "@story/project";
import type {
  StoryDocument,
  StoryProjectStructure,
} from "@story/project/types";

export async function commitDocumentWrites(
  project: StoryWorkspace,
  build: (
    documents: StoryDocument[],
    structure: StoryProjectStructure,
  ) => Pick<StoryDocument, "ref" | "value">[],
) {
  const summary = await project.describe();
  const structure = await project.describe({
    documentKinds: Object.keys(summary.documents),
  });
  // listDocuments intentionally excludes the manifest. Read the revision first,
  // so changes after this snapshot are rejected by the atomic commit.
  const context = await project.readContext({ scope: "project" });
  const documents = await project.listDocuments();
  const overview = await project.overview();
  const writes = build(documents, structure);
  if (writes.length) {
    const result = await project.commitChanges({
      storyTypeId: structure.storyType.id,
      storyTypeVersion: structure.storyType.version,
      storyId: overview.id,
      baseRevision: context.revision,
      validationMode: "draft",
      operations: writes.map((document) => ({ type: "upsert", ...document })),
    });
    if (!result.committed)
      throw new Error(
        result.issues.map((issue) => issue.message).join("\n") ||
          "保存失败，请重试。",
      );
  }
  const [nextDocuments, nextOverview] = await Promise.all([
    project.listDocuments(),
    project.overview(),
  ]);
  return { documents: nextDocuments, overview: nextOverview, structure };
}
