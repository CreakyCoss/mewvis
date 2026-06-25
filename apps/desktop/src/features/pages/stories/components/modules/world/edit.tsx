import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset, StoryContextLorebookEntry } from "@/features/story";
import {
  createStoryLorebookEntry,
  EditorField,
  EmptyBlock,
  splitKeywords,
} from "../../shared";
import type { StoryModuleSave } from "../types";

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
                  <div key={entry.id} className="rounded-md border p-3">
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
                          setDraft({
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
                              updateEntry(entry.id, (current) => ({
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
                              updateEntry(entry.id, (current) => ({
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
                              updateEntry(entry.id, (current) => ({
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
                                updateEntry(entry.id, (current) => ({
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
                                updateEntry(entry.id, (current) => ({
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
