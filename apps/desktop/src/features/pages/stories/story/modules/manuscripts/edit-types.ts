import type {
  StoryManuscriptDraft,
  StoryManuscriptDraftUpdateInput,
  StoryManuscriptSubmissionInput,
} from "@/features/story/model/manuscript-inbox";

export type ManuscriptEditMode = "create" | "edit";

export type ManuscriptEditDraft = Pick<StoryManuscriptDraft, "title" | "summary" | "content" | "branchId" | "nodeId">;

export const createManuscriptEditDraft = (draft: StoryManuscriptDraft): ManuscriptEditDraft => ({
  title: draft.title,
  summary: draft.summary,
  content: draft.content,
  branchId: draft.branchId,
  nodeId: draft.nodeId,
});

export const createManuscriptDraftPatch = (
  draft: ManuscriptEditDraft | null,
): StoryManuscriptDraftUpdateInput | null =>
  draft
    ? {
        title: draft.title,
        summary: draft.summary,
        content: draft.content,
        branchId: draft.branchId,
      }
    : null;

export const createManuscriptSubmission = (
  draft: ManuscriptEditDraft | null,
): Omit<StoryManuscriptSubmissionInput, "storyId" | "source"> | null =>
  draft
    ? {
        nodeId: draft.nodeId,
        branchId: draft.branchId,
        title: draft.title,
        summary: draft.summary,
        content: draft.content,
      }
    : null;
