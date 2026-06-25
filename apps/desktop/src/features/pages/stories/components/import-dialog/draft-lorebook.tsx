import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryImportDraft } from "@/features/story";
import { splitKeywords } from "../story-form-utils";
import { EditorField, EmptyBlock, StorySection } from "../story-primitives";
import { updateImportLore } from "./draft-utils";

type StoryImportDraftLorebookProps = {
  draft: StoryImportDraft;
  onChange: (draft: StoryImportDraft) => void;
};

export const StoryImportDraftLorebook = ({
  draft,
  onChange,
}: StoryImportDraftLorebookProps) => (
  <StorySection icon={FileText} title="世界书">
    {draft.lorebookEntries.length === 0 ? (
      <EmptyBlock text="暂无世界书条目" />
    ) : (
      <div className="space-y-3">
        {draft.lorebookEntries.map((entry) => (
          <div key={entry.id} className="rounded-md border p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="truncate text-sm font-medium">{entry.title}</div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onChange({
                    ...draft,
                    lorebookEntries: draft.lorebookEntries.filter((item) =>
                      item.id !== entry.id
                    ),
                  })
                }
                title="移除世界书"
                aria-label="移除世界书"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
              <EditorField label="标题">
                <Input
                  value={entry.title}
                  onChange={(event) =>
                    onChange(updateImportLore(draft, entry.id, {
                      title: event.target.value,
                    }))
                  }
                />
              </EditorField>
              <EditorField label="关键词">
                <Input
                  value={entry.keywords.join("、")}
                  onChange={(event) =>
                    onChange(updateImportLore(draft, entry.id, {
                      keywords: splitKeywords(event.target.value),
                    }))
                  }
                />
              </EditorField>
              <div className="md:col-span-2">
                <EditorField label="内容">
                  <Textarea
                    className="min-h-20 resize-y"
                    value={entry.content}
                    onChange={(event) =>
                      onChange(updateImportLore(draft, entry.id, {
                        content: event.target.value,
                      }))
                    }
                  />
                </EditorField>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </StorySection>
);
