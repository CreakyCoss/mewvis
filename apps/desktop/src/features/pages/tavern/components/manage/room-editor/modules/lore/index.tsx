import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "../../../../../types";
import {
  EditorSection,
  editorDangerIconActionButtonClassName,
  editorHeaderActionButtonClassName,
  editorIconActionButtonClassName,
  editorListBadgeClassName,
  editorListEntryBodyClassName,
  editorListEntryTitleClassName,
  editorListKeywordClassName,
} from "../../primitives";
import { emptyValueText, formatCount } from "../../utils";
import type { PendingDangerAction } from "../../types";
import { LoreEdit, type LoreEditHandle } from "./edit";
import type { ModuleEditProps, ModuleSave } from "../types";

type LoreSectionProps = {
  data: TavernRoom;
  onSave: ModuleSave;
  onRequestDangerAction: (action: PendingDangerAction) => void;
  renderTextFieldAgentActions: ModuleEditProps["renderTextFieldAgentActions"];
};

export const LoreSection = ({
  data,
  onSave,
  onRequestDangerAction,
  renderTextFieldAgentActions,
}: LoreSectionProps) => {
  const editRef = useRef<LoreEditHandle>(null);
  const [collapsedEntryIds, setCollapsedEntryIds] = useState<Record<string, boolean>>({});
  const areAllCollapsed = data.lorebookEntries.length > 0
    ? data.lorebookEntries.every((entry) => collapsedEntryIds[entry.id])
    : false;

  const setAllCollapsed = (collapsed: boolean) => {
    setCollapsedEntryIds(Object.fromEntries(
      data.lorebookEntries.map((entry) => [entry.id, collapsed]),
    ));
  };

  return (
    <>
      <EditorSection
        icon={BookOpen}
        title="世界书"
        description="维护整个酒馆故事可被关键词触发或常驻生效的共享设定资料。"
        meta={formatCount(data.lorebookEntries.length, "条")}
        action={(
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={editorHeaderActionButtonClassName}
              disabled={data.lorebookEntries.length === 0}
              title={areAllCollapsed ? "全部展开世界书" : "全部折叠世界书"}
              aria-label={areAllCollapsed ? "全部展开世界书" : "全部折叠世界书"}
              onClick={() => setAllCollapsed(!areAllCollapsed)}
            >
              {areAllCollapsed ? (
                <>
                  <ChevronDown className="size-3.5" />
                  全部展开
                </>
              ) : (
                <>
                  <ChevronRight className="size-3.5" />
                  全部折叠
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={editorHeaderActionButtonClassName}
              onClick={() => editRef.current?.()}
            >
              <Plus className="size-3.5" />
              新增
            </Button>
          </div>
        )}
      >
        <ol className="space-y-3 pl-7">
          {data.lorebookEntries.map((entry, index) => {
            const isCollapsed = Boolean(collapsedEntryIds[entry.id]);

            return (
              <li key={entry.id} className="relative">
                {index < data.lorebookEntries.length - 1 && (
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
                      className={`${editorIconActionButtonClassName} mt-0.5`}
                      title={isCollapsed ? "展开世界书" : "折叠世界书"}
                      aria-label={isCollapsed ? "展开世界书" : "折叠世界书"}
                      onClick={() => setCollapsedEntryIds((current) => ({
                        ...current,
                        [entry.id]: !isCollapsed,
                      }))}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <div className={editorListEntryTitleClassName}>
                          {entry.title || emptyValueText}
                        </div>
                        {!isCollapsed && (
                          <>
                            <Badge
                              variant={entry.enabled ? "secondary" : "outline"}
                              className={editorListBadgeClassName}
                            >
                              {entry.enabled ? "启用" : "停用"}
                            </Badge>
                            {entry.alwaysOn && (
                              <Badge
                                variant="outline"
                                className={editorListBadgeClassName}
                              >
                                常驻
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                      {!isCollapsed && (
                        <>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {entry.keywords.length > 0 ? (
                              entry.keywords.map((keyword) => (
                                <span
                                  key={keyword}
                                  className={editorListKeywordClassName}
                                >
                                  {keyword}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] leading-4 text-muted-foreground">
                                无关键词
                              </span>
                            )}
                          </div>
                          <div className={`mt-2 ${editorListEntryBodyClassName}`}>
                            {entry.content || emptyValueText}
                          </div>
                        </>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className={editorIconActionButtonClassName}
                      title="编辑世界书"
                      aria-label="编辑世界书"
                      onClick={() => editRef.current?.(entry)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className={editorDangerIconActionButtonClassName}
                      title="删除世界书"
                      aria-label="删除世界书"
                      onClick={() => {
                        const entryLabel = entry.title.trim() || "未命名世界书";
                        onRequestDangerAction({
                          title: "删除世界书",
                          description:
                            `删除世界书「${entryLabel}」？确认后它会立即从当前酒馆的设定资料中移除。`,
                          confirmLabel: "删除世界书",
                          onConfirm: () => onSave({
                            lorebookEntries: data.lorebookEntries.filter(
                              (item) => item.id !== entry.id,
                            ),
                          }),
                        });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
          {data.lorebookEntries.length === 0 && (
            <li className="rounded-md bg-muted/15 px-3 py-4 text-center text-sm text-muted-foreground">
              暂无世界书。
            </li>
          )}
        </ol>
      </EditorSection>

      <LoreEdit
        bind={editRef}
        data={data}
        onSave={onSave}
        renderTextFieldAgentActions={renderTextFieldAgentActions}
      />
    </>
  );
};
