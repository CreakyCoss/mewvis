import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import {
  Clock,
  FileText,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createTavernTimelineEvent } from "../../../../../storage";
import type { TavernTimelineEvent } from "../../../../../types";
import {
  EditorField,
  EditorFormCard,
  EditorFormDialogContent,
  EditorFormFooter,
  EditorFormHeader,
  EditorFormLayout,
  EditorFormNav,
  EditorFormSidebarCard,
  EditorFormSidebarPanel,
  EditorStatusPill,
} from "../../primitives";
import { editorControlClassName, emptyValueText } from "../../utils";
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
        <EditorFormDialogContent className="sm:max-w-4xl">
          <EditorFormHeader
            icon={Clock}
            title={draft.eventId ? "编辑时间线事件" : "新增时间线事件"}
            description="剧情事件会写入大故事时间线，点击保存修改后立即生效。"
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <EditorFormLayout
              sidebar={(
                <>
                  <EditorFormSidebarCard
                    icon={Clock}
                    title={draft.title.trim() || emptyValueText}
                    meta={(
                      <EditorStatusPill tone={draft.eventId ? "info" : "active"}>
                        {draft.eventId ? "编辑事件" : "新增事件"}
                      </EditorStatusPill>
                    )}
                  >
                    <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                      {draft.summary.trim() || "还没有填写事件摘要。"}
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="已有事件">
                    <div className="text-sm font-medium leading-5">
                      {data.timelineEvents.length} 条
                    </div>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-timeline-basic-section", icon: Clock, label: "事件标题" },
                      { href: "#tavern-timeline-summary-section", icon: FileText, label: "事件摘要" },
                    ]}
                  />
                </>
              )}
            >
              <EditorFormCard
                id="tavern-timeline-basic-section"
                icon={Clock}
                title="事件标题"
                description="用于在时间线列表中快速识别剧情节点。"
              >
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
              </EditorFormCard>

              <EditorFormCard
                id="tavern-timeline-summary-section"
                icon={FileText}
                title="事件摘要"
                description="摘要应保留明确事实，便于后续剧情承接。"
              >
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
              </EditorFormCard>

              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </EditorFormLayout>

            <EditorFormFooter status="保存后会立即更新剧情时间线。">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                保存修改
              </Button>
            </EditorFormFooter>
          </form>
        </EditorFormDialogContent>
      )}
    </Dialog>
  );
};
