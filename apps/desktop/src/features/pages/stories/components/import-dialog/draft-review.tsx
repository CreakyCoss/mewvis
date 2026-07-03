import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryImportDraft } from "@/features/story";
import { EmptyBlock } from "../story-primitives";
import { StoryImportDraftCharacters } from "./draft-characters";
import { StoryImportDraftLorebook } from "./draft-lorebook";
import { StoryImportDraftScenes } from "./draft-scenes";
import { StoryImportDraftStoryFields } from "./draft-story-fields";
import { StoryImportDraftSummary } from "./draft-summary";

type StoryImportDraftReviewProps = {
  importDraft: StoryImportDraft | null;
  setImportDraft: (draft: StoryImportDraft | null) => void;
};

export const StoryImportDraftReview = ({
  importDraft,
  setImportDraft,
}: StoryImportDraftReviewProps) => (
  <ScrollArea className="min-h-0 w-full rounded-md border bg-background lg:flex-1">
    <div className="space-y-4 p-4">
      {!importDraft ? (
        <EmptyBlock text="转换后会在这里预览标准草稿" />
      ) : (
        <>
          <StoryImportDraftSummary draft={importDraft} />
          <StoryImportDraftStoryFields
            draft={importDraft}
            onChange={setImportDraft}
          />
          <StoryImportDraftCharacters
            draft={importDraft}
            onChange={setImportDraft}
          />
          <StoryImportDraftScenes
            draft={importDraft}
            onChange={setImportDraft}
          />
          <StoryImportDraftLorebook
            draft={importDraft}
            onChange={setImportDraft}
          />
        </>
      )}
    </div>
  </ScrollArea>
);
