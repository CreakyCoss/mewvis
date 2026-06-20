import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createTavernTimelineEvent } from "../../../../../storage";
import type { TavernTimelineEvent } from "../../../../../types";
import { EditorField } from "../../primitives";
import { editorControlClassName } from "../../utils";
import type { ModuleSave } from "../types";

export type TimelineEditHandle = (event?: TavernTimelineEvent | null) => void;

type TimelineDraft = {
  eventId: string | null;
  title: string;
  summary: string;
};

type TimelineEditProps = {
  bind: Ref<TimelineEditHandle>;
  data: {
    timelineEvents: TavernTimelineEvent[];
  };
  onSave: ModuleSave;
};

export const TimelineEdit = ({
  bind,
  data,
  onSave,
}: TimelineEditProps) => {
  const [draft, setDraft] = useState<TimelineDraft | null>(null);
  const [error, setError] = useState("");

  const open = (event: TavernTimelineEvent | null = null) => {
    setError("");
    setDraft({
      eventId: event?.id ?? null,
      title: event?.title ?? "",
      summary: event?.summary ?? "",
    });
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
    setError("");
  };

  const save = () => {
    if (!draft) {
      return;
    }

    const title = draft.title.trim();
    const summary = draft.summary.trim();
    if (!title || !summary) {
      setError("请填写事件标题和摘要。");
      return;
    }

    onSave({
      timelineEvents: draft.eventId
        ? data.timelineEvents.map((item) =>
            item.id === draft.eventId
              ? {
                  ...item,
                  title,
                  summary,
                  updatedAt: Date.now(),
                }
              : item
          )
        : [
            ...data.timelineEvents,
            createTavernTimelineEvent({ title, summary }),
          ],
    });
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
      {draft && (
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft.eventId ? "编辑时间线事件" : "新增时间线事件"}</DialogTitle>
            <DialogDescription>
              剧情事件会进入大故事时间线草稿，保存酒馆后才生效。
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-3">
                <EditorField label="事件标题" htmlFor="tavern-timeline-title">
                  <Input
                    id="tavern-timeline-title"
                    value={draft.title}
                    className={editorControlClassName}
                    onChange={(event) => setDraft({
                      ...draft,
                      title: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField label="事件摘要" htmlFor="tavern-timeline-summary">
                  <Textarea
                    id="tavern-timeline-summary"
                    value={draft.summary}
                    className={cn("min-h-[120px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      summary: event.target.value,
                    })}
                  />
                </EditorField>
              </div>

              {error && (
                <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">保存修改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
};
