import { ChevronDown, ChevronRight, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StoryJson } from "../../model/types";
import {
  EmptyBlock,
  StorySection,
  editorDangerIconActionButtonClassName,
  editorHeaderActionButtonClassName,
  editorIconActionButtonClassName,
  editorListBadgeClassName,
  editorListEntryBodyClassName,
  editorListEntryTitleClassName,
  editorListKeywordClassName,
  emptyValueText,
} from "../../../components/story-primitives";
import { formatCount } from "../utils";
import type { StoryModuleSave } from "../types";
import { StoryWorldEdit, type StoryWorldEditHandle } from "./edit";

type StoryWorldModuleProps = {
  story: StoryJson;
  onSave: StoryModuleSave;
};

export const StoryWorldModule = ({ story, onSave }: StoryWorldModuleProps) => {
  const editRef = useRef<StoryWorldEditHandle>(null);
  const [collapsedEntryIds, setCollapsedEntryIds] = useState<Record<string, boolean>>({});
  const areAllCollapsed =
    story.lorebookEntries.length > 0 ? story.lorebookEntries.every((entry) => collapsedEntryIds[entry.id]) : false;

  const setAllCollapsed = (collapsed: boolean) => {
    setCollapsedEntryIds(Object.fromEntries(story.lorebookEntries.map((entry) => [entry.id, collapsed])));
  };
  const deleteEntry = (entryId: string) => {
    onSave({
      ...story,
      lorebookEntries: story.lorebookEntries.filter((entry) => entry.id !== entryId),
      updatedAt: Date.now(),
    });
  };

  return (
    <>
      <StorySection
        icon={FileText}
        title="世界书"
        description="维护背景设定、关键词触发和常驻上下文。"
        meta={formatCount(story.lorebookEntries.length, "条")}
        action={
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={editorHeaderActionButtonClassName}
              disabled={story.lorebookEntries.length === 0}
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
              onClick={() => editRef.current?.(null)}
            >
              <Plus className="size-3.5" />
              新增
            </Button>
          </div>
        }
      >
        {story.lorebookEntries.length === 0 ? (
          <EmptyBlock text="暂无世界书条目" />
        ) : (
          <ol className="space-y-3 pl-7">
            {story.lorebookEntries.map((entry, index) => {
              const isCollapsed = Boolean(collapsedEntryIds[entry.id]);

              return (
                <li key={entry.id} className="relative">
                  {index < story.lorebookEntries.length - 1 ? (
                    <span className="absolute -bottom-3 -left-4 top-9 w-px bg-border" aria-hidden="true" />
                  ) : null}
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
                        onClick={() =>
                          setCollapsedEntryIds((current) => ({
                            ...current,
                            [entry.id]: !isCollapsed,
                          }))
                        }
                      >
                        {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </Button>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <div className={editorListEntryTitleClassName}>{entry.title || emptyValueText}</div>
                          {!isCollapsed ? (
                            <>
                              <Badge
                                variant={entry.enabled ? "secondary" : "outline"}
                                className={editorListBadgeClassName}
                              >
                                {entry.enabled ? "启用" : "停用"}
                              </Badge>
                              {entry.alwaysOn ? (
                                <Badge variant="outline" className={editorListBadgeClassName}>
                                  常驻
                                </Badge>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        {!isCollapsed ? (
                          <>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {entry.keywords.length > 0 ? (
                                entry.keywords.map((keyword) => (
                                  <span key={keyword} className={editorListKeywordClassName}>
                                    {keyword}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] leading-4 text-muted-foreground">无关键词</span>
                              )}
                            </div>
                            <div className={`mt-2 ${editorListEntryBodyClassName}`}>
                              {entry.content || emptyValueText}
                            </div>
                          </>
                        ) : null}
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
                        onClick={() => deleteEntry(entry.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </StorySection>

      <StoryWorldEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};
