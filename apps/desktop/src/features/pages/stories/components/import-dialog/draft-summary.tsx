import { Badge } from "@/components/ui/badge";
import type { StoryImportDraft } from "@/features/story";
import {
  formatCount,
  storyImportSourceLabels,
} from "../story-form-utils";

type StoryImportDraftSummaryProps = {
  draft: StoryImportDraft;
};

export const StoryImportDraftSummary = ({
  draft,
}: StoryImportDraftSummaryProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">
      {draft.mode === "lorebookPatch" ? "世界书补丁" : "完整故事"}
    </Badge>
    <Badge variant="outline">{storyImportSourceLabels[draft.sourceKind]}</Badge>
    <Badge variant="outline">{formatCount(draft.characters.length, "角色")}</Badge>
    <Badge variant="outline">{formatCount(draft.scenes.length, "场景")}</Badge>
    <Badge variant="outline">{formatCount(draft.lorebookEntries.length, "世界书")}</Badge>
  </div>
);
