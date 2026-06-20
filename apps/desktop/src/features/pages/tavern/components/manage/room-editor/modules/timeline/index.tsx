import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "../../../../../types";
import { EditorSection } from "../../primitives";
import { emptyValueText, formatCount } from "../../utils";
import type { PendingDangerAction } from "../../types";
import { TimelineEdit, type TimelineEditHandle } from "./edit";
import type { ModuleSave } from "../types";

type TimelineSectionProps = {
  data: TavernRoom;
  onSave: ModuleSave;
  onRequestDangerAction: (action: PendingDangerAction) => void;
};

export const TimelineSection = ({
  data,
  onSave,
  onRequestDangerAction,
}: TimelineSectionProps) => {
  const editRef = useRef<TimelineEditHandle>(null);
  const [collapsedEventIds, setCollapsedEventIds] = useState<Record<string, boolean>>({});
  const areAllCollapsed = data.timelineEvents.length > 0
    ? data.timelineEvents.every((event) => collapsedEventIds[event.id])
    : false;

  const setAllCollapsed = (collapsed: boolean) => {
    setCollapsedEventIds(Object.fromEntries(
      data.timelineEvents.map((event) => [event.id, collapsed]),
    ));
  };

  return (
    <>
      <EditorSection
        icon={Clock}
        title="剧情时间线"
        description="沉淀整个大故事已经确定发生过的关键事件。"
        meta={formatCount(data.timelineEvents.length, "事件")}
        action={(
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={data.timelineEvents.length === 0}
              title={areAllCollapsed ? "全部展开剧情事件" : "全部折叠剧情事件"}
              aria-label={areAllCollapsed ? "全部展开剧情事件" : "全部折叠剧情事件"}
              onClick={() => setAllCollapsed(!areAllCollapsed)}
            >
              {areAllCollapsed ? (
                <ChevronsUpDown className="size-3.5" />
              ) : (
                <ChevronsDownUp className="size-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => editRef.current?.()}
            >
              <Plus className="size-3.5" />
              新增
            </Button>
          </div>
        )}
      >
        <ol className="space-y-3 pl-7">
          {data.timelineEvents.map((event, index) => {
            const isCollapsed = Boolean(collapsedEventIds[event.id]);

            return (
              <li key={event.id} className="relative">
                {index < data.timelineEvents.length - 1 && (
                  <span
                    className="absolute -bottom-3 -left-4 top-9 w-px bg-border"
                    aria-hidden="true"
                  />
                )}
                <span className="absolute -left-7 top-3 flex size-6 items-center justify-center rounded-full border bg-background text-[11px] font-medium text-muted-foreground shadow-xs">
                  {index + 1}
                </span>
                <div className="rounded-md bg-muted/15 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="mt-0.5"
                      title={isCollapsed ? "展开剧情事件" : "折叠剧情事件"}
                      aria-label={isCollapsed ? "展开剧情事件" : "折叠剧情事件"}
                      onClick={() => setCollapsedEventIds((current) => ({
                        ...current,
                        [event.id]: !isCollapsed,
                      }))}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-5">
                        {event.title || emptyValueText}
                      </div>
                      {!isCollapsed && (
                        <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {event.summary || emptyValueText}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      title="编辑剧情事件"
                      aria-label="编辑剧情事件"
                      onClick={() => editRef.current?.(event)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      title="删除剧情事件"
                      aria-label="删除剧情事件"
                      onClick={() => {
                        const eventLabel = event.title.trim() || `剧情事件 ${index + 1}`;
                        onRequestDangerAction({
                          title: "删除剧情事件",
                          description: `删除剧情事件「${eventLabel}」？`,
                          secondDescription:
                            "再次确认删除剧情事件？保存后它会从当前酒馆的剧情时间线中移除。",
                          confirmLabel: "删除事件",
                          onConfirm: () => onSave({
                            timelineEvents: data.timelineEvents.filter(
                              (item) => item.id !== event.id,
                            ),
                          }),
                        });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
          {data.timelineEvents.length === 0 && (
            <li className="rounded-md bg-muted/15 px-3 py-4 text-center text-sm text-muted-foreground">
              暂无剧情事件。
            </li>
          )}
        </ol>
      </EditorSection>

      <TimelineEdit
        bind={editRef}
        data={data}
        onSave={onSave}
      />
    </>
  );
};
