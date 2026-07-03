import type { ReactNode } from "react";
import {
  BookOpenText,
  BriefcaseBusiness,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { Button } from "@/components/ui/button";
import { HoverCardContent } from "@/components/ui/hover-card";
import { getVisualPreset } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import type { TavernCharacter, TavernRoom } from "../../../../types";
import {
  formatTavernCharacterRelationshipSummary,
} from "../../../../core/relationships";
import { compactText, emptyValueText } from "../shared";
import type { ResolvedStatusMetric } from "../types";
import { CharacterMetricView } from "./status-metric";

const trimText = (value: string | undefined) => value?.trim() ?? "";

const trimArray = (values: string[] | undefined) =>
  values?.map((value) => value.trim()).filter(Boolean) ?? [];

const splitLines = (value: string | undefined) =>
  trimText(value).split(/\n+/).map((line) => line.trim()).filter(Boolean);

const splitPhrases = (value: string | undefined) =>
  trimText(value)
    .split(/[，,、；;。.!！？?]+/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0 && phrase.length <= 8)
    .slice(0, 3);

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const Pill = ({ children }: { children: ReactNode }) => (
  <span className="max-w-full truncate rounded-md bg-primary/10 px-1.5 py-1 text-[11px] font-medium leading-none text-primary">
    {children}
  </span>
);

const DetailSection = ({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Shield;
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-lg border border-current/10 bg-current/[0.06] dark:bg-current/[0.085] p-2.5 shadow-sm">
    <div className="mb-2 flex min-w-0 items-center gap-2 text-[12px] font-semibold text-current">
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="truncate">{title}</span>
    </div>
    {children}
  </section>
);

const TextBlock = ({
  value,
  empty = emptyValueText,
}: {
  value: string | undefined;
  empty?: string;
}) => (
  <div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-current/80">
    {compactText(value) === emptyValueText ? empty : compactText(value)}
  </div>
);

const LineList = ({
  lines,
  empty = emptyValueText,
}: {
  lines: string[];
  empty?: string;
}) => {
  if (lines.length === 0) {
    return <div className="text-xs leading-5 text-current/60">{empty}</div>;
  }

  return (
    <ul className="space-y-1.5 text-xs leading-5 text-current/80">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current/70" />
          <span className="min-w-0 whitespace-pre-wrap">{line}</span>
        </li>
      ))}
    </ul>
  );
};

export const CharacterDetail = ({
  character,
  room,
  memory,
  metrics,
  isBusy,
  isCompacting,
  isRebuilding,
  isExtractingMemory,
  onAddMemory,
  onExtractMemory,
  onCompact,
  onRebuild,
}: {
  character: TavernCharacter;
  room: TavernRoom;
  memory: string;
  metrics: ResolvedStatusMetric[];
  isBusy?: boolean;
  isCompacting?: boolean;
  isRebuilding?: boolean;
  isExtractingMemory?: boolean;
  onAddMemory?: () => void;
  onExtractMemory?: () => void;
  onCompact?: () => void;
  onRebuild?: () => void;
}) => {
  const avatar = resolveAvatar(character.avatar).src;
  const publicStatus = room.characterPublicStatuses[character.id];
  const privateStatus = room.characterPrivateStatuses[character.id];
  const holding = trimArray(publicStatus?.holding);
  const privateKnowledge = trimArray(privateStatus?.privateKnowledge);
  const speakingPhrases = splitPhrases(character.speakingStyle);
  const headerPills = unique([
    trimText(publicStatus?.visibleMood),
    trimText(publicStatus?.posture),
    ...speakingPhrases,
  ]).slice(0, 4);
  const profileSummary =
    trimText(character.description) ||
    trimText(publicStatus?.publicGoal) ||
    trimText(character.goals) ||
    trimText(character.speakingStyle);
  const stanceLines = [
    publicStatus?.location ? `位置：${publicStatus.location}` : "",
    publicStatus?.posture ? `姿态：${publicStatus.posture}` : "",
    publicStatus?.visibleMood ? `外显情绪：${publicStatus.visibleMood}` : "",
    publicStatus?.outfit ? `装束：${publicStatus.outfit}` : "",
    publicStatus?.visibleInjury ? `可见伤势：${publicStatus.visibleInjury}` : "",
    holding.length > 0 ? `持有：${holding.join("、")}` : "",
    privateStatus?.privateMood ? `私下情绪：${privateStatus.privateMood}` : "",
    privateStatus?.suspicion ? `疑虑：${privateStatus.suspicion}` : "",
  ].filter(Boolean);
  const goalLines = [
    ...splitLines(character.goals),
    publicStatus?.publicGoal ? `公开目标：${publicStatus.publicGoal}` : "",
    privateStatus?.hiddenGoal ? `隐藏目标：${privateStatus.hiddenGoal}` : "",
  ].filter(Boolean);
  const styleLines = [
    trimText(character.speakingStyle),
    character.writingStyle ? `叙述：${character.writingStyle}` : "",
    character.replyStylePrompt ? `回复约束：${character.replyStylePrompt}` : "",
  ].filter(Boolean);
  const relationshipSummary = formatTavernCharacterRelationshipSummary({
    character,
    room,
    maxItems: 4,
  });
  const relationshipLines = splitLines(relationshipSummary);
  const memoryLines = [
    trimText(memory),
    privateKnowledge.length > 0 ? `已知信息：${privateKnowledge.join("、")}` : "",
  ].filter(Boolean);
  const visibleMetrics = metrics.slice(0, 4);
  const visualPreset = getVisualPreset(room.scenePresetId);
  const actionButtonClassName =
    "h-auto justify-start gap-3 border-current/15 bg-current/[0.055] px-3 py-2 text-left text-current hover:bg-current/10 hover:text-current dark:bg-current/[0.075]";

  return (
    <HoverCardContent
      side="left"
      align="start"
      sideOffset={8}
      className="w-[36rem] max-w-[calc(100vw-2rem)] !bg-transparent !p-0 text-left !shadow-none !ring-0"
    >
      <div
        className={cn(
          "space-y-2.5 rounded-xl border p-2.5 shadow-xl ring-1 ring-current/10",
          visualPreset.tavern.page,
          visualPreset.tavern.sidePanel,
        )}
      >
        <div className="overflow-hidden rounded-lg border border-current/10 bg-current/[0.075] dark:bg-current/[0.1] shadow-sm">
          <div className="grid min-h-36 md:grid-cols-[10.5rem_minmax(0,1fr)]">
            <div className="min-h-36 bg-current/10">
              <img
                src={avatar}
                alt=""
                className="size-full object-cover"
              />
            </div>
            <div className="min-w-0 p-4">
              <div className="truncate text-xl font-semibold leading-tight text-current">
                {character.name}
              </div>
              {headerPills.length > 0 && (
                <div className="mt-2.5 flex min-w-0 flex-wrap gap-1.5">
                  {headerPills.map((pill) => (
                    <Pill key={pill}>{pill}</Pill>
                  ))}
                </div>
              )}
              <div className="mt-3 line-clamp-3 text-[13px] leading-6 text-current/70">
                {profileSummary || "暂无角色设定"}
              </div>
              {visibleMetrics.length > 0 ? (
                <div className="mt-3 grid max-w-[20rem] grid-cols-2 gap-1.5">
                  {visibleMetrics.map((metric) => (
                    <CharacterMetricView
                      key={metric.key}
                      metric={metric}
                      variant="featured"
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-3 max-w-[20rem] rounded-lg border border-current/10 bg-current/[0.06] px-3 py-2 text-xs text-current/65 dark:bg-current/[0.085]">
                  暂无可见状态
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          <DetailSection icon={Shield} title="当前立场">
            <LineList lines={stanceLines} empty="暂无公开状态" />
          </DetailSection>
          <DetailSection icon={Target} title="目标">
            <LineList lines={goalLines} empty="暂无目标" />
          </DetailSection>
          <DetailSection icon={MessageCircle} title="说话方式">
            {speakingPhrases.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {speakingPhrases.map((phrase) => (
                  <Pill key={phrase}>{phrase}</Pill>
                ))}
              </div>
            )}
            <LineList lines={styleLines} empty="暂无说话方式" />
          </DetailSection>
          <DetailSection icon={UsersRound} title="关系">
            <LineList lines={relationshipLines} empty="暂无关系记录" />
          </DetailSection>
        </div>

        <DetailSection icon={BookOpenText} title="角色记忆">
          {memoryLines.length > 0 ? (
            <LineList lines={memoryLines} />
          ) : (
            <TextBlock value={undefined} empty="暂无稳定记忆" />
          )}
        </DetailSection>

        {(onAddMemory || onExtractMemory || onCompact || onRebuild) && (
          <DetailSection icon={BriefcaseBusiness} title="角色工具">
            <div className="grid gap-2 md:grid-cols-2">
              {onAddMemory && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onAddMemory}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Plus className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">添加记忆</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      手动追加角色记忆
                    </span>
                  </span>
                </Button>
              )}
              {onExtractMemory && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onExtractMemory}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {isExtractingMemory ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">从剧情整理</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      生成待确认记忆草稿
                    </span>
                  </span>
                </Button>
              )}
              {onCompact && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onCompact}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {isCompacting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">压缩角色知识</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      控制底层角色上下文长度
                    </span>
                  </span>
                </Button>
              )}
              {onRebuild && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onRebuild}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {isRebuilding ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">重建记忆</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      基于历史重建角色记忆
                    </span>
                  </span>
                </Button>
              )}
            </div>
          </DetailSection>
        )}
      </div>
    </HoverCardContent>
  );
};
