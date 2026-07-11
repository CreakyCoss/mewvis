import { useEffect, useState } from "react";
import { Activity, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { withRebuiltManifest, type StoryProject } from "../../../story-contract";
import type { StoryProjectSave } from "./types";
import { joinList, splitList, StructureCard, StructureField, StructureHeader } from "./shared";

const selectClassName =
  "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

export const StoryTrackingEditor = ({ project, onSave }: { project: StoryProject; onSave: StoryProjectSave }) => {
  const [draft, setDraft] = useState(project);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setDraft(project), [project]);

  const addForeshadow = () => {
    const number = draft.foreshadows.foreshadows.length + 1;
    let id = `foreshadow-${String(number).padStart(3, "0")}`;
    while (draft.foreshadows.foreshadows.some((item) => item.id === id)) {
      id = `${id}-next`;
    }
    setDraft((current) => ({
      ...current,
      foreshadows: {
        ...current.foreshadows,
        foreshadows: [
          ...current.foreshadows.foreshadows,
          {
            id,
            content: "",
            status: "planned",
            importance: "medium",
            relatedEntityIds: [],
            resolution: "",
          },
        ],
      },
    }));
  };

  const save = async () => {
    setIsSaving(true);
    const timestamp = Date.now();
    const next = withRebuiltManifest(
      {
        ...draft,
        foreshadows: { ...draft.foreshadows, updatedAt: timestamp },
        progress: { ...draft.progress, updatedAt: timestamp },
      },
      { revision: project.manifest.revision + 1, timestamp },
    );
    try {
      await onSave(next);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <StructureHeader
        icon={Activity}
        title="连续性追踪"
        description="维护当前进度、角色状态、伏笔和故事时间线。"
        action={
          <Button type="button" className="gap-2" onClick={() => void save()} disabled={isSaving}>
            <Save className="size-4" />
            {isSaving ? "保存中" : "保存追踪"}
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <StructureCard title="写作进度" description="供日更确定断点和下一章。">
          <div className="grid gap-4">
            <StructureField label="已写总字数" htmlFor="story-progress-words">
              <Input
                id="story-progress-words"
                type="number"
                min={0}
                value={draft.progress.totalWrittenWords || ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    progress: { ...current.progress, totalWrittenWords: Math.max(0, Number(event.target.value) || 0) },
                  }))
                }
              />
            </StructureField>
            <StructureField label="下一章细纲" htmlFor="story-progress-next-plan">
              <select
                id="story-progress-next-plan"
                className={selectClassName}
                value={draft.progress.nextChapterPlanId ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    progress: { ...current.progress, nextChapterPlanId: event.target.value || undefined },
                  }))
                }
              >
                <option value="">未指定</option>
                {draft.chapterPlans
                  .slice()
                  .sort((left, right) => left.number - right.number)
                  .map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      第 {plan.number} 章 · {plan.title}
                    </option>
                  ))}
              </select>
            </StructureField>
            <StructureField label="注意事项" htmlFor="story-progress-notes" helper="使用逗号或换行分隔。">
              <Textarea
                id="story-progress-notes"
                className="min-h-28 resize-y"
                value={joinList(draft.progress.notes)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    progress: { ...current.progress, notes: splitList(event.target.value) },
                  }))
                }
              />
            </StructureField>
          </div>
        </StructureCard>

        <StructureCard title="角色状态" description="每章召回只读取涉及角色的最新快照。">
          <div className="space-y-2">
            {draft.characterStates.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm leading-6 text-muted-foreground">
                尚无状态快照。写完第一章或通过创作助手初始化后会在这里出现。
              </p>
            ) : (
              draft.characterStates.map((state) => {
                const character = draft.characters.find((item) => item.id === state.characterId);
                return (
                  <div key={state.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{character?.name ?? state.characterId}</span>
                      <Badge variant="outline">{state.asOfChapterId ?? "初始"}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {state.identity || state.location || state.publicImage || "尚未记录状态细节"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </StructureCard>

        <StructureCard title="时间线" description="按卷拆分，避免长篇时间关系互相覆盖。">
          <div className="space-y-2">
            {draft.timelines.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm leading-6 text-muted-foreground">
                尚无时间线。章节写作提交时会同步建立事件。
              </p>
            ) : (
              draft.timelines.map((timeline) => (
                <div key={timeline.id} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{timeline.calendar || timeline.id}</span>
                    <Badge variant="secondary">{timeline.entries.length} 事件</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {timeline.openingTime || "未设起点"} → {timeline.currentTime || "当前时间未定"}
                  </p>
                </div>
              ))
            )}
          </div>
        </StructureCard>
      </div>

      <StructureCard title="伏笔追踪" description="planned 表示尚未埋设；resolved 必须关联实际回收章节。">
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={addForeshadow}>
            <Plus className="size-4" />
            新增伏笔
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {draft.foreshadows.foreshadows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">暂无伏笔。</p>
          ) : (
            draft.foreshadows.foreshadows.map((foreshadow, index) => (
              <div key={foreshadow.id} className="rounded-lg border bg-background p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]">
                  <StructureField label={`伏笔 ${index + 1}`} htmlFor={`story-foreshadow-${foreshadow.id}`}>
                    <Input
                      id={`story-foreshadow-${foreshadow.id}`}
                      value={foreshadow.content}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          foreshadows: {
                            ...current.foreshadows,
                            foreshadows: current.foreshadows.foreshadows.map((item) =>
                              item.id === foreshadow.id ? { ...item, content: event.target.value } : item,
                            ),
                          },
                        }))
                      }
                    />
                  </StructureField>
                  <StructureField label="状态" htmlFor={`story-foreshadow-status-${foreshadow.id}`}>
                    <select
                      id={`story-foreshadow-status-${foreshadow.id}`}
                      className={selectClassName}
                      value={foreshadow.status}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          foreshadows: {
                            ...current.foreshadows,
                            foreshadows: current.foreshadows.foreshadows.map((item) =>
                              item.id === foreshadow.id
                                ? { ...item, status: event.target.value as typeof item.status }
                                : item,
                            ),
                          },
                        }))
                      }
                    >
                      <option value="planned">计划</option>
                      <option value="planted">已埋</option>
                      <option value="advanced">推进中</option>
                      <option value="resolved">已回收</option>
                      <option value="expired">过期</option>
                      <option value="abandoned">放弃</option>
                    </select>
                  </StructureField>
                  <StructureField label="重要度" htmlFor={`story-foreshadow-importance-${foreshadow.id}`}>
                    <select
                      id={`story-foreshadow-importance-${foreshadow.id}`}
                      className={selectClassName}
                      value={foreshadow.importance}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          foreshadows: {
                            ...current.foreshadows,
                            foreshadows: current.foreshadows.foreshadows.map((item) =>
                              item.id === foreshadow.id
                                ? { ...item, importance: event.target.value as typeof item.importance }
                                : item,
                            ),
                          },
                        }))
                      }
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </StructureField>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={`删除伏笔 ${index + 1}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          foreshadows: {
                            ...current.foreshadows,
                            foreshadows: current.foreshadows.foreshadows.filter((item) => item.id !== foreshadow.id),
                          },
                        }))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </StructureCard>
    </div>
  );
};
