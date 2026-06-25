import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { FileText, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryAsset, StoryContextLorebookEntry } from "@/features/story";
import { createStoryLorebookEntry } from "../../story-form-utils";
import { EmptyBlock } from "../../story-primitives";
import type { StoryModuleSave } from "../types";
import { StoryLorebookEntryEditCard } from "./lorebook-entry-card";

export type StoryWorldEditHandle = (story?: StoryAsset) => void;

type StoryWorldEditProps = {
  bind: Ref<StoryWorldEditHandle>;
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryWorldEdit = ({
  bind,
  story,
  onSave,
}: StoryWorldEditProps) => {
  const [draft, setDraft] = useState<StoryAsset | null>(null);

  const open = (nextStory = story) => setDraft(nextStory);

  useImperativeHandle(bind, () => open);

  const close = () => setDraft(null);

  const updateEntry = (
    entryId: string,
    updater: (entry: StoryContextLorebookEntry) => StoryContextLorebookEntry,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            lorebookEntries: current.lorebookEntries.map((entry) =>
              entry.id === entryId ? updater(entry) : entry
            ),
          }
        : current
    );
  };

  const save = () => {
    if (!draft) {
      return;
    }
    onSave(draft);
    close();
  };

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {draft ? (
        <DialogContent className="max-h-[min(90vh,52rem)] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              编辑世界书
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[min(68vh,40rem)] pr-3">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      lorebookEntries: [
                        ...draft.lorebookEntries,
                        createStoryLorebookEntry(draft.lorebookEntries.length),
                      ],
                    })
                  }
                >
                  <Plus className="size-4" />
                  添加世界书
                </Button>
              </div>
              {draft.lorebookEntries.length === 0 ? (
                <EmptyBlock text="暂无世界书条目" />
              ) : (
                draft.lorebookEntries.map((entry, index) => (
                  <StoryLorebookEntryEditCard
                    key={entry.id}
                    draft={draft}
                    entry={entry}
                    index={index}
                    onDraftChange={setDraft}
                    onUpdateEntry={updateEntry}
                  />
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              取消
            </Button>
            <Button type="button" className="gap-2" onClick={save}>
              <Save className="size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
