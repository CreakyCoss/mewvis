import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryImportDraft } from "@/features/story";
import { EditorField } from "../story-primitives";

type StoryImportDraftStoryFieldsProps = {
  draft: StoryImportDraft;
  onChange: (draft: StoryImportDraft) => void;
};

export const StoryImportDraftStoryFields = ({
  draft,
  onChange,
}: StoryImportDraftStoryFieldsProps) => (
  <div className="grid gap-3 md:grid-cols-2">
    <EditorField label="标题">
      <Input
        value={draft.story.title}
        onChange={(event) =>
          onChange({
            ...draft,
            story: { ...draft.story, title: event.target.value },
          })
        }
      />
    </EditorField>
    <EditorField label="用户称呼">
      <Input
        value={draft.story.userPersonaName}
        onChange={(event) =>
          onChange({
            ...draft,
            story: { ...draft.story, userPersonaName: event.target.value },
          })
        }
      />
    </EditorField>
    <EditorField label="故事定位">
      <Textarea
        className="min-h-24 resize-y"
        value={draft.story.outline}
        onChange={(event) =>
          onChange({
            ...draft,
            story: { ...draft.story, outline: event.target.value },
          })
        }
      />
    </EditorField>
    <EditorField label="目标">
      <Textarea
        className="min-h-24 resize-y"
        value={draft.story.goal}
        onChange={(event) =>
          onChange({
            ...draft,
            story: { ...draft.story, goal: event.target.value },
          })
        }
      />
    </EditorField>
  </div>
);
