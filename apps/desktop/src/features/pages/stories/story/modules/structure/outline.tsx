import { useEffect, useMemo, useState } from "react";
import { BookOpenText, ListPlus, Plus, Save, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  STORY_PROJECT_SCHEMA_VERSION,
  withRebuiltManifest,
  type StoryChapterPlanFile,
  type StoryProject,
  type StoryVolumeFile,
} from "../../../story-contract";
import type { StoryProjectSave } from "./types";
import { joinList, splitList, StructureCard, StructureField, StructureHeader } from "./shared";

const selectClassName =
  "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

const pad = (value: number) => String(value).padStart(3, "0");

const nextEntityId = (prefix: string, number: number, usedIds: Set<string>) => {
  const base = `${prefix}-${pad(number)}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const createVolume = (project: StoryProject, number: number): StoryVolumeFile => {
  const usedIds = new Set(project.manifest.files.map((file) => file.id));
  const startChapter = project.volumes.reduce((latest, volume) => Math.max(latest, volume.endChapter), 0) + 1;
  return {
    schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
    kind: "story-volume",
    id: nextEntityId("vol", number, usedIds),
    number,
    title: `第 ${number} 卷`,
    startChapter,
    endChapter: startChapter,
    targetWords: 0,
    phase: number === 1 ? "opening" : "development",
    purpose: "",
    coreConflict: "",
    coreEvent: "",
    startState: "",
    endState: "",
    emotionalArc: "",
    allowedReveals: [],
    prohibitedReveals: [],
    chapterIds: [],
    updatedAt: Date.now(),
  };
};

const createChapterPlan = (project: StoryProject, volume: StoryVolumeFile, number: number): StoryChapterPlanFile => {
  const usedIds = new Set(project.manifest.files.map((file) => file.id));
  return {
    schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
    kind: "story-chapter-plan",
    id: nextEntityId("ch", number, usedIds),
    number,
    volumeId: volume.id,
    title: `第 ${number} 章`,
    phase: volume.phase === "mixed" ? "development" : volume.phase === "custom" ? "custom" : volume.phase,
    phasePosition: "",
    chapterRole: "progress",
    targetWords: 0,
    targetEmotion: "",
    coreEvent: "",
    structureFormula: "",
    openingHook: "",
    payoff: "",
    releaseGuards: [],
    summary: { cause: "", development: "", turn: "", climax: "", ending: "" },
    plotLines: { main: "", secondary: "", event: "", relationship: "", logic: "" },
    participantIds: [],
    appearanceOrder: [],
    worldRefIds: [],
    pointOfView: "",
    informationGap: "",
    relationshipChanges: [],
    beats: [],
    costAndPayoff: "",
    ending: {
      resolvedState: "",
      unresolvedQuestion: "",
      nextDrive: "",
      hookType: "",
      hookStrength: "medium",
    },
    status: "draft",
    updatedAt: Date.now(),
  };
};

const createDefaultStages = (totalChapters: number) => {
  const total = Math.max(4, totalChapters || 100);
  const openingEnd = Math.max(1, Math.round(total * 0.12));
  const developmentEnd = Math.max(openingEnd + 1, Math.round(total * 0.7));
  const climaxEnd = Math.max(developmentEnd + 1, Math.round(total * 0.93));
  return [
    {
      id: "stage-opening",
      name: "开篇期",
      phase: "opening" as const,
      startChapter: 1,
      endChapter: openingEnd,
      purpose: "立人设、立世界、建立主线期待",
      emotionalTone: "",
      expectedReaderState: "",
      allowedReveals: [],
      prohibitedReveals: [],
    },
    {
      id: "stage-development",
      name: "发展期",
      phase: "development" as const,
      startChapter: openingEnd + 1,
      endChapter: developmentEnd,
      purpose: "展开矛盾、升级关系与资源",
      emotionalTone: "",
      expectedReaderState: "",
      allowedReveals: [],
      prohibitedReveals: [],
    },
    {
      id: "stage-climax",
      name: "高潮期",
      phase: "climax" as const,
      startChapter: developmentEnd + 1,
      endChapter: climaxEnd,
      purpose: "核心冲突爆发并收束多线",
      emotionalTone: "",
      expectedReaderState: "",
      allowedReveals: [],
      prohibitedReveals: [],
    },
    {
      id: "stage-ending",
      name: "收尾期",
      phase: "ending" as const,
      startChapter: climaxEnd + 1,
      endChapter: total,
      purpose: "回收伏笔、落定关系与结局",
      emotionalTone: "",
      expectedReaderState: "",
      allowedReveals: [],
      prohibitedReveals: [],
    },
  ];
};

export const StoryOutlineEditor = ({ project, onSave }: { project: StoryProject; onSave: StoryProjectSave }) => {
  const [draft, setDraft] = useState(project);
  const [selectedVolumeId, setSelectedVolumeId] = useState(project.volumes[0]?.id ?? "");
  const [selectedPlanId, setSelectedPlanId] = useState(project.chapterPlans[0]?.id ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(project);
    setSelectedVolumeId((current) =>
      project.volumes.some((volume) => volume.id === current) ? current : (project.volumes[0]?.id ?? ""),
    );
    setSelectedPlanId((current) =>
      project.chapterPlans.some((plan) => plan.id === current) ? current : (project.chapterPlans[0]?.id ?? ""),
    );
  }, [project]);

  const selectedVolume = draft.volumes.find((volume) => volume.id === selectedVolumeId) ?? null;
  const selectedPlan = draft.chapterPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  const sortedPlans = useMemo(
    () => [...draft.chapterPlans].sort((left, right) => left.number - right.number),
    [draft.chapterPlans],
  );

  const updateVolume = (patch: Partial<StoryVolumeFile>) => {
    if (!selectedVolume) return;
    setDraft((current) => ({
      ...current,
      volumes: current.volumes.map((volume) => (volume.id === selectedVolume.id ? { ...volume, ...patch } : volume)),
    }));
  };

  const updatePlan = (patch: Partial<StoryChapterPlanFile>) => {
    if (!selectedPlan) return;
    setDraft((current) => ({
      ...current,
      chapterPlans: current.chapterPlans.map((plan) => (plan.id === selectedPlan.id ? { ...plan, ...patch } : plan)),
    }));
  };

  const addVolume = () => {
    const number = draft.volumes.reduce((latest, volume) => Math.max(latest, volume.number), 0) + 1;
    const volume = createVolume(draft, number);
    setDraft((current) => ({ ...current, volumes: [...current.volumes, volume] }));
    setSelectedVolumeId(volume.id);
  };

  const addChapter = () => {
    const volume = selectedVolume ?? draft.volumes[0];
    if (!volume) return;
    const number = draft.chapterPlans.reduce((latest, plan) => Math.max(latest, plan.number), 0) + 1;
    const plan = createChapterPlan(draft, volume, number);
    setDraft((current) => ({ ...current, chapterPlans: [...current.chapterPlans, plan] }));
    setSelectedPlanId(plan.id);
  };

  const addBeat = () => {
    if (!selectedPlan) return;
    const nextIndex = selectedPlan.beats.length + 1;
    updatePlan({
      beats: [
        ...selectedPlan.beats,
        {
          id: `beat-${selectedPlan.id}-${String(nextIndex).padStart(2, "0")}`,
          summary: "",
          function: "progress",
          density: "medium",
          wordBudget: 0,
          participantIds: [],
          worldRefIds: [],
        },
      ],
    });
  };

  const save = async () => {
    setIsSaving(true);
    const timestamp = Date.now();
    const plansByVolume = new Map<string, string[]>();
    for (const plan of draft.chapterPlans) {
      plansByVolume.set(plan.volumeId, [...(plansByVolume.get(plan.volumeId) ?? []), plan.id]);
    }
    const next = withRebuiltManifest(
      {
        ...draft,
        bookArc: {
          ...draft.bookArc,
          volumeIds: draft.volumes
            .slice()
            .sort((left, right) => left.number - right.number)
            .map((volume) => volume.id),
          updatedAt: timestamp,
        },
        volumes: draft.volumes.map((volume) => ({
          ...volume,
          chapterIds: plansByVolume.get(volume.id) ?? [],
          updatedAt: timestamp,
        })),
        chapterPlans: draft.chapterPlans.map((plan) => ({ ...plan, updatedAt: timestamp })),
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
        icon={BookOpenText}
        title="全书与章节大纲"
        description="按全书阶段、卷和章节细纲维护长期叙事结构。"
        action={
          <Button type="button" className="gap-2" onClick={() => void save()} disabled={isSaving}>
            <Save className="size-4" />
            {isSaving ? "保存中" : "保存大纲"}
          </Button>
        }
      />

      <StructureCard title="全书阶段" description="阶段边界用于阻止章节提前泄露后期真相。">
        <div className="grid gap-4 md:grid-cols-[12rem_12rem_minmax(0,1fr)]">
          <StructureField label="总章节数" htmlFor="story-outline-total-chapters">
            <Input
              id="story-outline-total-chapters"
              type="number"
              min={0}
              value={draft.bookArc.totalChapters || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bookArc: { ...current.bookArc, totalChapters: Math.max(0, Number(event.target.value) || 0) },
                }))
              }
            />
          </StructureField>
          <StructureField label="目标字数" htmlFor="story-outline-target-words">
            <Input
              id="story-outline-target-words"
              type="number"
              min={0}
              value={draft.bookArc.targetWords || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bookArc: { ...current.bookArc, targetWords: Math.max(0, Number(event.target.value) || 0) },
                }))
              }
            />
          </StructureField>
          <StructureField label="全书情绪曲线" htmlFor="story-outline-emotional-arc">
            <Input
              id="story-outline-emotional-arc"
              value={draft.bookArc.emotionalArc}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bookArc: { ...current.bookArc, emotionalArc: event.target.value },
                }))
              }
            />
          </StructureField>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {draft.bookArc.stages.map((stage) => (
              <Badge key={stage.id} variant="secondary">
                {stage.name} · {stage.startChapter}-{stage.endChapter} 章
              </Badge>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                bookArc: { ...current.bookArc, stages: createDefaultStages(current.bookArc.totalChapters) },
              }))
            }
          >
            <Waypoints className="size-4" />
            生成四阶段
          </Button>
        </div>
      </StructureCard>

      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <StructureCard title="卷纲" description={`${draft.volumes.length} 卷`}>
          <div className="space-y-2">
            {draft.volumes.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                还没有卷纲。先新增第一卷，再创建章节细纲。
              </p>
            ) : (
              draft.volumes
                .slice()
                .sort((left, right) => left.number - right.number)
                .map((volume) => (
                  <button
                    key={volume.id}
                    type="button"
                    onClick={() => setSelectedVolumeId(volume.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selectedVolumeId === volume.id ? "border-primary/50 bg-primary/[0.06]" : "bg-background"}`}
                  >
                    <div className="text-sm font-semibold">{volume.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      第 {volume.startChapter}-{volume.endChapter} 章 · {volume.phase}
                    </div>
                  </button>
                ))
            )}
            <Button type="button" variant="outline" className="w-full" onClick={addVolume}>
              <Plus className="size-4" />
              新增卷
            </Button>
          </div>
        </StructureCard>

        <StructureCard title={selectedVolume?.title ?? "卷纲详情"} description="卷级边界会进入本卷每章的召回上下文。">
          {selectedVolume ? (
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <StructureField label="卷名" htmlFor="story-volume-title">
                  <Input
                    id="story-volume-title"
                    value={selectedVolume.title}
                    onChange={(event) => updateVolume({ title: event.target.value })}
                  />
                </StructureField>
                <StructureField label="起始章节" htmlFor="story-volume-start">
                  <Input
                    id="story-volume-start"
                    type="number"
                    min={1}
                    value={selectedVolume.startChapter}
                    onChange={(event) => updateVolume({ startChapter: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </StructureField>
                <StructureField label="结束章节" htmlFor="story-volume-end">
                  <Input
                    id="story-volume-end"
                    type="number"
                    min={1}
                    value={selectedVolume.endChapter}
                    onChange={(event) => updateVolume({ endChapter: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </StructureField>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <StructureField label="本卷功能" htmlFor="story-volume-purpose">
                  <Textarea
                    id="story-volume-purpose"
                    className="min-h-20"
                    value={selectedVolume.purpose}
                    onChange={(event) => updateVolume({ purpose: event.target.value })}
                  />
                </StructureField>
                <StructureField label="核心冲突" htmlFor="story-volume-conflict">
                  <Textarea
                    id="story-volume-conflict"
                    className="min-h-20"
                    value={selectedVolume.coreConflict}
                    onChange={(event) => updateVolume({ coreConflict: event.target.value })}
                  />
                </StructureField>
                <StructureField label="起始状态" htmlFor="story-volume-start-state">
                  <Textarea
                    id="story-volume-start-state"
                    className="min-h-20"
                    value={selectedVolume.startState}
                    onChange={(event) => updateVolume({ startState: event.target.value })}
                  />
                </StructureField>
                <StructureField label="结束状态" htmlFor="story-volume-end-state">
                  <Textarea
                    id="story-volume-end-state"
                    className="min-h-20"
                    value={selectedVolume.endState}
                    onChange={(event) => updateVolume({ endState: event.target.value })}
                  />
                </StructureField>
                <StructureField label="允许释放" htmlFor="story-volume-allowed" helper="使用逗号分隔。">
                  <Textarea
                    id="story-volume-allowed"
                    className="min-h-20"
                    value={joinList(selectedVolume.allowedReveals)}
                    onChange={(event) => updateVolume({ allowedReveals: splitList(event.target.value) })}
                  />
                </StructureField>
                <StructureField label="禁止提前释放" htmlFor="story-volume-prohibited" helper="使用逗号分隔。">
                  <Textarea
                    id="story-volume-prohibited"
                    className="min-h-20"
                    value={joinList(selectedVolume.prohibitedReveals)}
                    onChange={(event) => updateVolume({ prohibitedReveals: splitList(event.target.value) })}
                  />
                </StructureField>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">请选择或新增一卷。</p>
          )}
        </StructureCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <StructureCard title="章节细纲" description={`${draft.chapterPlans.length} 章`}>
          <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
            {sortedPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setSelectedVolumeId(plan.volumeId);
                }}
                className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selectedPlanId === plan.id ? "border-primary/50 bg-primary/[0.06]" : "bg-background"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {plan.number}. {plan.title}
                  </span>
                  <Badge variant="outline">{plan.status}</Badge>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {plan.coreEvent || "未填写核心事件"}
                </div>
              </button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={addChapter}
              disabled={draft.volumes.length === 0}
            >
              <ListPlus className="size-4" />
              新增章节细纲
            </Button>
          </div>
        </StructureCard>

        <StructureCard
          title={selectedPlan ? `第 ${selectedPlan.number} 章细纲` : "章节细纲详情"}
          description="情节点预算会在保存前做代码校验。"
        >
          {selectedPlan ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StructureField label="章名" htmlFor="story-plan-title">
                  <Input
                    id="story-plan-title"
                    value={selectedPlan.title}
                    onChange={(event) => updatePlan({ title: event.target.value })}
                  />
                </StructureField>
                <StructureField label="所属卷" htmlFor="story-plan-volume">
                  <select
                    id="story-plan-volume"
                    className={selectClassName}
                    value={selectedPlan.volumeId}
                    onChange={(event) => updatePlan({ volumeId: event.target.value })}
                  >
                    {draft.volumes.map((volume) => (
                      <option key={volume.id} value={volume.id}>
                        {volume.title}
                      </option>
                    ))}
                  </select>
                </StructureField>
                <StructureField label="目标字数" htmlFor="story-plan-target">
                  <Input
                    id="story-plan-target"
                    type="number"
                    min={0}
                    value={selectedPlan.targetWords || ""}
                    onChange={(event) => updatePlan({ targetWords: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </StructureField>
                <StructureField label="章节定位" htmlFor="story-plan-role">
                  <select
                    id="story-plan-role"
                    className={selectClassName}
                    value={selectedPlan.chapterRole}
                    onChange={(event) =>
                      updatePlan({ chapterRole: event.target.value as StoryChapterPlanFile["chapterRole"] })
                    }
                  >
                    <option value="high-pressure">高压</option>
                    <option value="progress">推进</option>
                    <option value="training">修炼试错</option>
                    <option value="relationship">关系回收</option>
                    <option value="low-pressure">低压生活</option>
                    <option value="information">信息整理</option>
                    <option value="transition">过渡</option>
                    <option value="custom">自定义</option>
                  </select>
                </StructureField>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <StructureField label="目标情绪" htmlFor="story-plan-emotion">
                  <Input
                    id="story-plan-emotion"
                    value={selectedPlan.targetEmotion}
                    onChange={(event) => updatePlan({ targetEmotion: event.target.value })}
                  />
                </StructureField>
                <StructureField label="章首钩子" htmlFor="story-plan-opening-hook">
                  <Input
                    id="story-plan-opening-hook"
                    value={selectedPlan.openingHook}
                    onChange={(event) => updatePlan({ openingHook: event.target.value })}
                  />
                </StructureField>
                <StructureField label="核心事件" htmlFor="story-plan-event">
                  <Textarea
                    id="story-plan-event"
                    className="min-h-20"
                    value={selectedPlan.coreEvent}
                    onChange={(event) => updatePlan({ coreEvent: event.target.value })}
                  />
                </StructureField>
                <StructureField label="禁止提前释放" htmlFor="story-plan-guards" helper="使用逗号分隔。">
                  <Textarea
                    id="story-plan-guards"
                    className="min-h-20"
                    value={joinList(selectedPlan.releaseGuards)}
                    onChange={(event) => updatePlan({ releaseGuards: splitList(event.target.value) })}
                  />
                </StructureField>
              </div>
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold">情节点预算</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      当前合计 {selectedPlan.beats.reduce((sum, beat) => sum + beat.wordBudget, 0)} 字
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addBeat}>
                    <Plus className="size-4" />
                    情节点
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {selectedPlan.beats.map((beat, index) => (
                    <div
                      key={beat.id}
                      className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[minmax(0,1fr)_9rem_8rem]"
                    >
                      <StructureField label={`情节点 ${index + 1}`} htmlFor={`story-beat-${beat.id}`}>
                        <Input
                          id={`story-beat-${beat.id}`}
                          value={beat.summary}
                          onChange={(event) =>
                            updatePlan({
                              beats: selectedPlan.beats.map((item) =>
                                item.id === beat.id ? { ...item, summary: event.target.value } : item,
                              ),
                            })
                          }
                        />
                      </StructureField>
                      <StructureField label="密度" htmlFor={`story-beat-density-${beat.id}`}>
                        <select
                          id={`story-beat-density-${beat.id}`}
                          className={selectClassName}
                          value={beat.density}
                          onChange={(event) =>
                            updatePlan({
                              beats: selectedPlan.beats.map((item) =>
                                item.id === beat.id
                                  ? { ...item, density: event.target.value as typeof beat.density }
                                  : item,
                              ),
                            })
                          }
                        >
                          <option value="dense">密</option>
                          <option value="medium">中</option>
                          <option value="sparse">疏</option>
                        </select>
                      </StructureField>
                      <StructureField label="字数预算" htmlFor={`story-beat-budget-${beat.id}`}>
                        <Input
                          id={`story-beat-budget-${beat.id}`}
                          type="number"
                          min={0}
                          value={beat.wordBudget || ""}
                          onChange={(event) =>
                            updatePlan({
                              beats: selectedPlan.beats.map((item) =>
                                item.id === beat.id
                                  ? { ...item, wordBudget: Math.max(0, Number(event.target.value) || 0) }
                                  : item,
                              ),
                            })
                          }
                        />
                      </StructureField>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <StructureField label="结尾状态" htmlFor="story-plan-resolved">
                  <Textarea
                    id="story-plan-resolved"
                    className="min-h-20"
                    value={selectedPlan.ending.resolvedState}
                    onChange={(event) =>
                      updatePlan({ ending: { ...selectedPlan.ending, resolvedState: event.target.value } })
                    }
                  />
                </StructureField>
                <StructureField label="下一章驱动力" htmlFor="story-plan-next">
                  <Textarea
                    id="story-plan-next"
                    className="min-h-20"
                    value={selectedPlan.ending.nextDrive}
                    onChange={(event) =>
                      updatePlan({ ending: { ...selectedPlan.ending, nextDrive: event.target.value } })
                    }
                  />
                </StructureField>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">请选择或新增章节细纲。</p>
          )}
        </StructureCard>
      </div>
    </div>
  );
};
