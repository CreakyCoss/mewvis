import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset, StoryContextLorebookEntry } from "@/features/story";
import { splitKeywords } from "../../story-form-utils";
import { EditorField } from "../../story-primitives";

type StoryLorebookEntryEditCardProps = {
  draft: StoryAsset;
  entry: StoryContextLorebookEntry;
  index: number;
  onDraftChange: (draft: StoryAsset) => void;
  onUpdateEntry: (
    entryId: string,
    updater: (entry: StoryContextLorebookEntry) => StoryContextLorebookEntry,
  ) => void;
};

export const StoryLorebookEntryEditCard = ({
  draft,
  entry,
  index,
  onDraftChange,
  onUpdateEntry,
}: StoryLorebookEntryEditCardProps) => (
  <div className="rounded-md border p-3">
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {entry.title || `世界书 ${index + 1}`}
        </div>
        <div className="text-xs text-muted-foreground">{entry.id}</div>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 text-muted-foreground hover:text-destructive"
        onClick={() =>
          onDraftChange({
            ...draft,
            lorebookEntries: draft.lorebookEntries.filter((item) => item.id !== entry.id),
          })
        }
        title="删除世界书"
        aria-label="删除世界书"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="space-y-3">
        <EditorField label="标题">
          <Input
            value={entry.title}
            onChange={(event) =>
              onUpdateEntry(entry.id, (current) => ({
                ...current,
                title: event.target.value,
              }))
            }
          />
        </EditorField>
        <EditorField label="内容">
          <Textarea
            className="min-h-32 resize-y"
            value={entry.content}
            onChange={(event) =>
              onUpdateEntry(entry.id, (current) => ({
                ...current,
                content: event.target.value,
              }))
            }
          />
        </EditorField>
      </div>
      <div className="space-y-3">
        <EditorField label="关键词">
          <Textarea
            className="min-h-24 resize-y"
            value={entry.keywords.join("、")}
            onChange={(event) =>
              onUpdateEntry(entry.id, (current) => ({
                ...current,
                keywords: splitKeywords(event.target.value),
              }))
            }
          />
        </EditorField>
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={entry.enabled}
              onChange={(event) =>
                onUpdateEntry(entry.id, (current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            启用
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={entry.alwaysOn}
              onChange={(event) =>
                onUpdateEntry(entry.id, (current) => ({
                  ...current,
                  alwaysOn: event.target.checked,
                }))
              }
            />
            常驻上下文
          </label>
        </div>
      </div>
    </div>
  </div>
);
