import { useEffect, useState } from "react";
import { Compass, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { withRebuiltManifest, type StoryProject } from "../../../story-contract";
import type { StoryProjectSave } from "./types";
import { joinList, splitList, StructureCard, StructureField, StructureHeader } from "./shared";

type PositioningDraft = {
  title: string;
  logline: string;
  premise: string;
  goal: string;
  centralConflict: string;
  finalObstacle: string;
  primaryGenre: string;
  secondaryGenres: string;
  targetPlatform: string;
  targetAudience: string;
  targetWords: string;
  emotionalPromise: string;
  surfaceHook: string;
  deepPayoff: string;
  longTermHook: string;
  differentiation: string;
  benchmarkTitles: string;
};

const createDraft = (project: StoryProject): PositioningDraft => ({
  title: project.book.title,
  logline: project.book.logline,
  premise: project.book.premise,
  goal: project.book.goal,
  centralConflict: project.book.centralConflict,
  finalObstacle: project.book.finalObstacle,
  primaryGenre: project.positioning.primaryGenre,
  secondaryGenres: joinList(project.positioning.secondaryGenres),
  targetPlatform: project.positioning.targetPlatform,
  targetAudience: project.positioning.targetAudience,
  targetWords: String(project.positioning.targetWords || ""),
  emotionalPromise: project.positioning.emotionalPromise,
  surfaceHook: project.positioning.surfaceHook,
  deepPayoff: project.positioning.deepPayoff,
  longTermHook: project.positioning.longTermHook,
  differentiation: project.positioning.differentiation,
  benchmarkTitles: joinList(project.positioning.benchmarkTitles),
});

export const StoryPositioningEditor = ({ project, onSave }: { project: StoryProject; onSave: StoryProjectSave }) => {
  const [draft, setDraft] = useState(() => createDraft(project));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(createDraft(project));
  }, [project]);

  const update = <K extends keyof PositioningDraft>(key: K, value: PositioningDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setIsSaving(true);
    const timestamp = Date.now();
    const next = withRebuiltManifest(
      {
        ...project,
        book: {
          ...project.book,
          title: draft.title.trim() || project.book.title,
          logline: draft.logline,
          premise: draft.premise,
          goal: draft.goal,
          centralConflict: draft.centralConflict,
          finalObstacle: draft.finalObstacle,
          updatedAt: timestamp,
        },
        positioning: {
          ...project.positioning,
          primaryGenre: draft.primaryGenre,
          secondaryGenres: splitList(draft.secondaryGenres),
          targetPlatform: draft.targetPlatform,
          targetAudience: draft.targetAudience,
          targetWords: Math.max(0, Number(draft.targetWords) || 0),
          emotionalPromise: draft.emotionalPromise,
          surfaceHook: draft.surfaceHook,
          deepPayoff: draft.deepPayoff,
          longTermHook: draft.longTermHook,
          differentiation: draft.differentiation,
          benchmarkTitles: splitList(draft.benchmarkTitles),
          updatedAt: timestamp,
        },
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
        icon={Compass}
        title="作品定位"
        description="定义这本书持续交付给目标读者的情绪、卖点和差异化。"
        action={
          <Button type="button" className="gap-2" onClick={() => void save()} disabled={isSaving}>
            <Save className="size-4" />
            {isSaving ? "保存中" : "保存定位"}
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <StructureCard title="作品核心" description="标题和核心冲突会进入每次全书级召回。">
          <div className="grid gap-4">
            <StructureField label="书名" htmlFor="story-structure-title">
              <Input
                id="story-structure-title"
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </StructureField>
            <StructureField label="一句话梗概" htmlFor="story-structure-logline">
              <Textarea
                id="story-structure-logline"
                className="min-h-20 resize-y"
                value={draft.logline}
                onChange={(event) => update("logline", event.target.value)}
              />
            </StructureField>
            <StructureField label="故事前提" htmlFor="story-structure-premise">
              <Textarea
                id="story-structure-premise"
                className="min-h-24 resize-y"
                value={draft.premise}
                onChange={(event) => update("premise", event.target.value)}
              />
            </StructureField>
            <StructureField label="主角目标" htmlFor="story-structure-goal">
              <Textarea
                id="story-structure-goal"
                className="min-h-20 resize-y"
                value={draft.goal}
                onChange={(event) => update("goal", event.target.value)}
              />
            </StructureField>
            <div className="grid gap-4 md:grid-cols-2">
              <StructureField label="核心冲突" htmlFor="story-structure-conflict">
                <Textarea
                  id="story-structure-conflict"
                  className="min-h-24 resize-y"
                  value={draft.centralConflict}
                  onChange={(event) => update("centralConflict", event.target.value)}
                />
              </StructureField>
              <StructureField label="终极阻碍" htmlFor="story-structure-obstacle">
                <Textarea
                  id="story-structure-obstacle"
                  className="min-h-24 resize-y"
                  value={draft.finalObstacle}
                  onChange={(event) => update("finalObstacle", event.target.value)}
                />
              </StructureField>
            </div>
          </div>
        </StructureCard>

        <StructureCard title="市场与读者" description="这些字段用于技能选择节奏、题材公式和质量标准。">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <StructureField label="主题材" htmlFor="story-structure-primary-genre">
                <Input
                  id="story-structure-primary-genre"
                  value={draft.primaryGenre}
                  onChange={(event) => update("primaryGenre", event.target.value)}
                />
              </StructureField>
              <StructureField label="副题材" htmlFor="story-structure-secondary-genres" helper="使用逗号分隔。">
                <Input
                  id="story-structure-secondary-genres"
                  value={draft.secondaryGenres}
                  onChange={(event) => update("secondaryGenres", event.target.value)}
                />
              </StructureField>
              <StructureField label="目标平台" htmlFor="story-structure-platform">
                <Input
                  id="story-structure-platform"
                  value={draft.targetPlatform}
                  onChange={(event) => update("targetPlatform", event.target.value)}
                />
              </StructureField>
              <StructureField label="目标字数" htmlFor="story-structure-target-words">
                <Input
                  id="story-structure-target-words"
                  type="number"
                  min={0}
                  value={draft.targetWords}
                  onChange={(event) => update("targetWords", event.target.value)}
                />
              </StructureField>
            </div>
            <StructureField label="目标读者" htmlFor="story-structure-audience">
              <Textarea
                id="story-structure-audience"
                className="min-h-20 resize-y"
                value={draft.targetAudience}
                onChange={(event) => update("targetAudience", event.target.value)}
              />
            </StructureField>
            <StructureField label="对标作品" htmlFor="story-structure-benchmarks" helper="只记录书名，使用逗号分隔。">
              <Input
                id="story-structure-benchmarks"
                value={draft.benchmarkTitles}
                onChange={(event) => update("benchmarkTitles", event.target.value)}
              />
            </StructureField>
          </div>
        </StructureCard>

        <StructureCard
          title="情绪承诺"
          description="把“为什么追读”拆成表层吸引、持续满足和长线期待。"
          className="xl:col-span-2"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StructureField label="核心情绪" htmlFor="story-structure-emotion">
              <Textarea
                id="story-structure-emotion"
                className="min-h-24 resize-y"
                value={draft.emotionalPromise}
                onChange={(event) => update("emotionalPromise", event.target.value)}
              />
            </StructureField>
            <StructureField label="表层卖点" htmlFor="story-structure-surface-hook">
              <Textarea
                id="story-structure-surface-hook"
                className="min-h-24 resize-y"
                value={draft.surfaceHook}
                onChange={(event) => update("surfaceHook", event.target.value)}
              />
            </StructureField>
            <StructureField label="深层满足" htmlFor="story-structure-deep-payoff">
              <Textarea
                id="story-structure-deep-payoff"
                className="min-h-24 resize-y"
                value={draft.deepPayoff}
                onChange={(event) => update("deepPayoff", event.target.value)}
              />
            </StructureField>
            <StructureField label="长线钩子" htmlFor="story-structure-long-hook">
              <Textarea
                id="story-structure-long-hook"
                className="min-h-24 resize-y"
                value={draft.longTermHook}
                onChange={(event) => update("longTermHook", event.target.value)}
              />
            </StructureField>
            <StructureField label="差异化" htmlFor="story-structure-differentiation">
              <Textarea
                id="story-structure-differentiation"
                className="min-h-24 resize-y"
                value={draft.differentiation}
                onChange={(event) => update("differentiation", event.target.value)}
              />
            </StructureField>
          </div>
        </StructureCard>
      </div>
    </div>
  );
};
