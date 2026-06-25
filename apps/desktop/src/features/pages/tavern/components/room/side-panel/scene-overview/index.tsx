import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Flag,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  advanceTavernProgressFromFactEvents,
  filterTavernFactEventsForAudience,
  getTavernStatusSnapshotValue,
  isTavernProgressVisibilityVisibleToUser,
  rebuildTavernProgressFromHistory,
  resolveTavernPendingStatusEvent,
} from "../../../../core";
import { runTavernProgressTracking } from "../../../../runtime/assistants";
import {
  addTavernSecretMemoryEntry,
  listTavernBranchSecretMemoryEntries,
  loadTavernBranchUpstreamMemory,
  projectTavernSceneOntoRoom,
  revealTavernSecretMemory,
  syncTavernRoomActiveScene,
  updateTavernActiveCharacterMemoryLayers,
  updateTavernActiveSceneMemoryLayers,
  updateTavernActiveScenePromptOverrides,
} from "../../../../storage";
import {
  getTavernSceneDisplayTitle,
  getTavernSceneInstanceDisplayTitle,
} from "../../../../scene-selectors";
import type {
  TavernCharacterMemoryLayers,
  TavernCondition,
  TavernFactEvent,
  TavernPromptBlock,
  TavernReplyMode,
  TavernRoom,
  TavernSceneMemoryLayers,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusTargetRef,
  TavernStatusValue,
  TavernTaskDefinition,
  TavernTaskState,
} from "../../../../types";
import { useTavernPageContext } from "../../../context";
import {
  compactText,
  MeterBar,
} from "../shared";
import { buildTavernMemoryOverviewSummary } from "../memory-summary";
import {
  createResolvedStatusMetric,
  getProgressStatusItems,
  numericStatusPercent,
} from "../status-utils";
import type {
  ResolvedStatusMetric,
  TaskCardData,
  TaskValueDisplay,
} from "../types";

type TaskCardDisplayData = {
  data: TaskCardData;
  conditionText: string;
};

type SceneOverviewSectionProps = {
  externalBusy: boolean;
  onBusyChange?: (isBusy: boolean) => void;
  onOpenTasksDetail: () => void;
  onOpenTipsDetail: () => void;
  onOpenScriptReviewDetail: () => void;
};

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const replyModeDescriptions: Record<TavernReplyMode, string> = {
  active: "仅当前选中的角色发言",
  round: "所有入席角色依次发言",
  director: "由导演选择合适角色发言",
};

const isIdentityFactEvent = (event: { type: string }) =>
  /(?:role|identity|faction|camp|alignment|身份|阵营)/i.test(event.type);

const formatStatusValue = (value: TavernStatusValue) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "无";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return value === null || value === "" ? "未记录" : String(value);
};

const formatMetricValue = (value: TavernStatusValue) => {
  if (typeof value === "number") {
    return String(Math.round(value));
  }
  return formatStatusValue(value);
};

const statusMaxValue = (definition: TavernStatusDefinition) =>
  typeof definition.max === "number" ? definition.max : 100;

const taskStatusLabels = {
  inactive: "未激活",
  active: "进行中",
  completed: "已完成",
  failed: "已失败",
} as const;

const conditionReferencesStatus = (
  condition: TavernCondition | undefined,
  statusId: string,
): boolean => {
  if (!condition) {
    return false;
  }
  if ("status" in condition && "target" in condition) {
    return condition.status === statusId;
  }
  if ("all" in condition) {
    return condition.all.some((item) => conditionReferencesStatus(item, statusId));
  }
  if ("any" in condition) {
    return condition.any.some((item) => conditionReferencesStatus(item, statusId));
  }
  if ("not" in condition) {
    return conditionReferencesStatus(condition.not, statusId);
  }
  return false;
};

const isDefaultSceneThreatMetric = (metric: ResolvedStatusMetric) =>
  metric.definition.id === "threat_level" &&
  metric.definition.scope === "scene" &&
  metric.definition.label === "威胁";

const roomHasActiveTaskForStatus = (
  room: TavernRoom,
  statusId: string,
) => room.taskDefinitions.some((task) => {
  if (!isTavernProgressVisibilityVisibleToUser(task.visibility)) {
    return false;
  }
  const status = room.taskSnapshot[task.id]?.status ?? task.lifecycle.initialStatus;
  if (status === "inactive") {
    return false;
  }
  return conditionReferencesStatus(task.lifecycle.startCondition, statusId) ||
    conditionReferencesStatus(task.lifecycle.completeCondition, statusId) ||
    conditionReferencesStatus(task.lifecycle.failCondition, statusId);
});

const shouldUseSituationMetric = (
  metric: ResolvedStatusMetric,
  room: TavernRoom,
) => {
  if (typeof metric.value !== "number") {
    return false;
  }
  if (!isDefaultSceneThreatMetric(metric)) {
    return true;
  }
  return roomHasActiveTaskForStatus(room, metric.definition.id);
};

const formatConditionTargetLabel = (
  target: TavernStatusTargetRef,
  characterNameById: Map<string, string>,
) => {
  switch (target.type) {
    case "global":
      return "全局";
    case "scene":
      return "";
    case "party":
      return `队伍 ${target.partyId}`;
    case "character":
      return characterNameById.get(target.characterId) ?? target.characterId;
    case "relationship": {
      const subject = target.subject.type === "character"
        ? characterNameById.get(target.subject.characterId) ?? target.subject.characterId
        : "你";
      const object = target.object.type === "character"
        ? characterNameById.get(target.object.characterId) ?? target.object.characterId
        : "你";
      return `${subject}对${object}`;
    }
  }
};

const formatTaskConditionCardText = (
  condition: TavernCondition | undefined,
  characterNameById: Map<string, string>,
  statusDefinitionById: Map<string, TavernStatusDefinition>,
): string => {
  if (!condition) {
    return "无额外条件";
  }
  if ("all" in condition) {
    return condition.all.map((item) =>
      formatTaskConditionCardText(item, characterNameById, statusDefinitionById)
    ).join(" 且 ");
  }
  if ("any" in condition) {
    return condition.any.map((item) =>
      formatTaskConditionCardText(item, characterNameById, statusDefinitionById)
    ).join(" 或 ");
  }
  if ("not" in condition) {
    return `非 ${formatTaskConditionCardText(condition.not, characterNameById, statusDefinitionById)}`;
  }
  if ("status" in condition && "target" in condition) {
    const targetLabel = formatConditionTargetLabel(condition.target, characterNameById);
    const statusLabel = statusDefinitionById.get(condition.status)?.label ?? condition.status;
    if (condition.lte !== undefined) {
      return `${targetLabel}${statusLabel}降至 ${condition.lte}`;
    }
    if (condition.gte !== undefined) {
      return `${targetLabel}${statusLabel}达到 ${condition.gte}`;
    }
    if (condition.equals !== undefined) {
      return `${targetLabel}${statusLabel}为 ${formatStatusValue(condition.equals)}`;
    }
    if (condition.notEquals !== undefined) {
      return `${targetLabel}${statusLabel}不是 ${formatStatusValue(condition.notEquals)}`;
    }
    return `${targetLabel}${statusLabel}变化`;
  }
  if ("factEvent" in condition) {
    return `出现 ${condition.factEvent} 事件`;
  }
  if ("task" in condition && "status" in condition) {
    return `任务 ${condition.task} ${taskStatusLabels[condition.status]}`;
  }
  if ("flag" in condition) {
    return `标记 ${condition.flag} 为 ${formatStatusValue(condition.equals)}`;
  }
  return "未知条件";
};

const findTaskStatusCondition = (
  condition: TavernCondition | undefined,
): Extract<TavernCondition, { status: string; target: TavernStatusTargetRef }> | null => {
  if (!condition) {
    return null;
  }
  if ("status" in condition && "target" in condition) {
    return condition;
  }
  if ("all" in condition) {
    return condition.all.map(findTaskStatusCondition).find((item) => item !== null) ?? null;
  }
  if ("any" in condition) {
    return condition.any.map(findTaskStatusCondition).find((item) => item !== null) ?? null;
  }
  return null;
};

const formatTaskNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatTaskMetricValue = (
  value: TavernStatusValue,
  definition: TavernStatusDefinition,
) => {
  if (typeof value !== "number") {
    return formatStatusValue(value);
  }
  const max = typeof definition.max === "number" ? definition.max : 100;
  return `${formatTaskNumber(Math.round(value))}/${formatTaskNumber(max)}`;
};

const formatTaskConditionTargetText = (
  condition: Extract<TavernCondition, { status: string; target: TavernStatusTargetRef }>,
) => {
  if (condition.lte !== undefined) {
    return `目标 ≤ ${formatTaskNumber(condition.lte)}`;
  }
  if (condition.gte !== undefined) {
    return `目标 ≥ ${formatTaskNumber(condition.gte)}`;
  }
  if (condition.equals !== undefined) {
    return `目标 = ${formatStatusValue(condition.equals)}`;
  }
  if (condition.notEquals !== undefined) {
    return `目标 ≠ ${formatStatusValue(condition.notEquals)}`;
  }
  return "等待变化";
};

const resolveTaskTargetPercent = (
  condition: Extract<TavernCondition, { status: string; target: TavernStatusTargetRef }>,
  definition: TavernStatusDefinition,
) => {
  const targetValue =
    condition.lte ??
    condition.gte ??
    (typeof condition.equals === "number" ? condition.equals : undefined);
  return typeof targetValue === "number"
    ? numericStatusPercent(targetValue, definition)
    : undefined;
};

const resolveTaskConditionMetric = ({
  activeRoom,
  task,
  characterNameById,
  statusDefinitionById,
}: {
  activeRoom: TavernRoom;
  task: TavernTaskDefinition;
  characterNameById: Map<string, string>;
  statusDefinitionById: Map<string, TavernStatusDefinition>;
}) => {
  const condition = findTaskStatusCondition(task.lifecycle.completeCondition);
  if (!condition) {
    return null;
  }

  const definition = statusDefinitionById.get(condition.status);
  if (!definition) {
    return null;
  }

  const value = getTavernStatusSnapshotValue(
    activeRoom.statusSnapshot,
    condition.target,
    definition.id,
  ) ?? definition.defaultValue;
  const targetLabel = formatConditionTargetLabel(condition.target, characterNameById);
  const metricLabel = `${targetLabel}${definition.label}` || definition.label;

  return {
    mode: "status",
    label: metricLabel,
    valueText: formatTaskMetricValue(value, definition),
    currentText: `当前：${metricLabel} ${formatStatusValue(value)}`,
    percent: numericStatusPercent(value, definition),
    targetText: formatTaskConditionTargetText(condition),
    targetPercent: resolveTaskTargetPercent(condition, definition),
  } satisfies TaskValueDisplay;
};

const resolveTaskProgressDisplay = ({
  activeRoom,
  task,
  state,
  characterNameById,
  statusDefinitionById,
}: {
  activeRoom: TavernRoom;
  task: TavernTaskDefinition;
  state?: TavernTaskState;
  characterNameById: Map<string, string>;
  statusDefinitionById: Map<string, TavernStatusDefinition>;
}): Pick<TaskCardData, "metric"> => {
  if (state?.progress && state.progress.target > 0) {
    return {
      metric: {
        mode: "progress",
        label: "任务进度",
        valueText: `${state.progress.current}/${state.progress.target}`,
        currentText: `当前：${state.progress.current} / ${state.progress.target}`,
        percent: Math.max(0, Math.min(100, (state.progress.current / state.progress.target) * 100)),
        targetText: `目标 ${state.progress.target}`,
        targetPercent: 100,
      },
    };
  }

  const status = state?.status ?? task.lifecycle.initialStatus;
  switch (status) {
    case "completed":
      return {};
    case "failed":
      return {};
    case "active": {
      const conditionMetric = resolveTaskConditionMetric({
        activeRoom,
        task,
        characterNameById,
        statusDefinitionById,
      });
      if (conditionMetric) {
        return { metric: conditionMetric };
      }
      if (task.progress?.target) {
        return {
          metric: {
            mode: "progress",
            label: "任务进度",
            valueText: `0/${task.progress.target}`,
            currentText: `当前：0 / ${task.progress.target}`,
            percent: 0,
            targetText: `目标 ${task.progress.target}`,
            targetPercent: 100,
          },
        };
      }
      return {};
    }
    case "inactive":
      return {};
  }
};

const situationStatusName = (metric: ResolvedStatusMetric | null) => {
  if (!metric) {
    return "局势";
  }
  return /威胁/.test(metric.definition.label) ? "威胁" : metric.definition.label;
};

const situationToneLabel = (metric: ResolvedStatusMetric | null) => {
  if (!metric || typeof metric.value !== "number") {
    return "待更新";
  }
  const statusName = situationStatusName(metric);
  if (metric.percent >= 80) {
    return `高${statusName}`;
  }
  if (metric.percent >= 35) {
    return `中高${statusName}`;
  }
  if (metric.percent >= 15) {
    return `中等${statusName}`;
  }
  return `低${statusName}`;
};

const situationToneText = (metric: ResolvedStatusMetric | null) => {
  if (!metric || typeof metric.value !== "number") {
    return "暂无明确局势，等待状态更新";
  }
  const statusName = situationStatusName(metric);
  if (metric.percent >= 80) {
    return `${statusName}升高，必须立刻压低风险`;
  }
  if (metric.percent >= 35) {
    return `局势紧张，需尽快压低${statusName}`;
  }
  if (metric.percent >= 15) {
    return `${statusName}仍可控，但需要持续留意`;
  }
  return `${statusName}较低，局势暂时稳定`;
};

const situationToneClassName = (metric: ResolvedStatusMetric | null) => {
  if (!metric || typeof metric.value !== "number") {
    return "border-current/10 bg-current/5 text-current/60";
  }
  if (metric.percent >= 80) {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  if (metric.percent >= 35) {
    return "border-orange-300/55 bg-orange-100/75 text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/15 dark:text-orange-300";
  }
  if (metric.percent >= 15) {
    return "border-amber-300/55 bg-amber-100/75 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300";
  }
  return "border-primary/15 bg-primary/10 text-primary";
};

const situationMeterClassName = (metric: ResolvedStatusMetric) => {
  if (metric.percent >= 80) {
    return "bg-destructive";
  }
  if (metric.percent >= 35) {
    return "bg-orange-500";
  }
  if (metric.percent >= 15) {
    return "bg-amber-500";
  }
  return "bg-primary";
};

const OverviewHeader = ({
  sceneTitle,
  scenePhase,
  sceneStatusItems,
}: {
  sceneTitle: string;
  scenePhase: string;
  sceneStatusItems: string[];
}) => (
  <header className="space-y-2">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight text-current">
          场景概览
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-current/70">
          <span className="min-w-0 truncate">{sceneTitle}</span>
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          <span className="shrink-0 font-medium text-primary">{scenePhase}</span>
        </div>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="查看对话设置"
            >
              <Settings className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="start"
            sideOffset={8}
            className="block max-w-72 whitespace-normal px-3 py-2 text-left leading-5"
          >
            <div className="space-y-1">
              {sceneStatusItems.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </header>
);

const SectionCard = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={`rounded-xl border border-current/10 bg-current/[0.045] dark:bg-current/[0.065] text-current shadow-sm ${className}`}>
    {children}
  </div>
);

const CardHeading = ({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) => (
  <div className="flex items-center gap-2 text-[13px] font-semibold">
    <Icon className="size-4 shrink-0 text-primary" />
    <span className="min-w-0 truncate">{children}</span>
  </div>
);

const GoalTargetIcon = () => (
  <span
    className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
    aria-hidden="true"
  >
    <Target className="size-5" />
    <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_75%,transparent)]" />
    <span className="absolute right-2 top-1.5 h-4 w-px -rotate-45 rounded-full bg-primary/75" />
    <span className="absolute right-1.5 top-1 size-1 rounded-full bg-primary/75" />
  </span>
);

const GoalCard = ({
  sceneGoal,
}: {
  sceneGoal: string | undefined;
}) => (
  <SectionCard className="overflow-hidden px-3 py-3">
    <div className="flex items-center gap-2.5">
      <GoalTargetIcon />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-primary">
          当前目标
        </div>
        <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5">
          {compactText(sceneGoal)}
        </div>
        <div className="mt-0.5 text-[11px] leading-4 text-current/65">
          当前回合最优先处理事项
        </div>
      </div>
    </div>
  </SectionCard>
);

const SituationCard = ({
  metric,
}: {
  metric: ResolvedStatusMetric;
}) => {
  const valueText = formatMetricValue(metric.value);
  const maxText = statusMaxValue(metric.definition);

  return (
    <SectionCard className="px-3 py-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <CardHeading icon={ShieldCheck}>当前局势</CardHeading>
        <span className={[
          "shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium leading-none",
          situationToneClassName(metric),
        ].join(" ")}
        >
          {situationToneLabel(metric)}
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-current/10 bg-current/5 px-3 py-2.5">
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] leading-none text-current/60">
              关注指标
            </div>
            <div className="mt-1 truncate text-[13px] font-semibold">
              {situationStatusName(metric)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-lg font-semibold leading-none text-primary tabular-nums">
              {valueText}
            </span>
            <span className="ml-0.5 text-xs text-current/60 tabular-nums">
              /{maxText}
            </span>
          </div>
        </div>
        <div className="mt-2.5">
          <MeterBar
            percent={metric.percent}
            className={situationMeterClassName(metric)}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] leading-none text-current/65">
          <span>低</span>
          <span>高</span>
        </div>
      </div>

      <div className="mt-2 text-[11px] leading-4 text-current/60">
        {situationToneText(metric)}
      </div>
    </SectionCard>
  );
};

const PendingStatusEvents = ({
  events,
  statusDefinitionById,
  isBusy,
  onResolve,
}: {
  events: TavernStatusEvent[];
  statusDefinitionById: Map<string, TavernStatusDefinition>;
  isBusy: boolean;
  onResolve: (statusEventId: string, resolution: "applied" | "rejected") => void;
}) => {
  if (events.length === 0) {
    return null;
  }

  return (
    <SectionCard className="space-y-2 px-3 py-3">
      <div className="text-xs font-semibold text-current/70">待确认状态</div>
      {events.map((event) => {
        const definition = statusDefinitionById.get(event.statusId);
        const before = formatStatusValue(event.before);
        const after = formatStatusValue(event.after);
        return (
          <div key={event.id} className="space-y-2 rounded-lg bg-current/5 px-2.5 py-2">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">
                  {definition?.label ?? event.statusId}
                </div>
                <div className="mt-0.5 text-[11px] tabular-nums text-current/65">
                  {before}{" -> "}{after}
                  {typeof event.delta === "number" && (
                    <span className={event.delta > 0 ? "ml-1 text-emerald-500" : "ml-1 text-destructive"}>
                      {event.delta > 0 ? "+" : ""}{event.delta}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-[11px] text-current/65">
                {Math.round(event.confidence * 100)}%
              </div>
            </div>
            <div className="line-clamp-2 text-[11px] leading-4 text-current/65">
              {event.reason}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                disabled={isBusy}
                onClick={() => onResolve(event.id, "applied")}
              >
                <Check className="size-3.5" />
                应用
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                disabled={isBusy}
                onClick={() => onResolve(event.id, "rejected")}
              >
                <X className="size-3.5" />
                拒绝
              </Button>
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
};

const TaskStatusPill = ({
  status,
}: {
  status: TaskCardData["status"];
}) => (
  <span
    className={[
      "rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
      status === "active" ? "bg-primary/10 text-primary" : "",
      status === "completed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "",
      status === "failed" ? "bg-destructive/10 text-destructive" : "",
      status === "inactive" ? "bg-current/10 text-current/60" : "",
    ].filter(Boolean).join(" ")}
  >
    {{
      inactive: "未激活",
      active: "进行中",
      completed: "已完成",
      failed: "已失败",
    }[status]}
  </span>
);

const taskMetricFillClassName = (status: TaskCardData["status"]) => {
  if (status === "completed") {
    return "bg-emerald-500";
  }
  if (status === "failed") {
    return "bg-destructive";
  }
  return "bg-primary";
};

const TaskMetricTrack = ({
  metric,
  status,
}: {
  metric: TaskValueDisplay;
  status: TaskCardData["status"];
}) => {
  const valuePercent = Math.max(0, Math.min(100, metric.percent));
  const targetPercent = metric.targetPercent === undefined
    ? undefined
    : Math.max(1, Math.min(99, metric.targetPercent));

  return (
    <span className="mt-2.5 block space-y-1.5">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] leading-4 text-current/65">
          {metric.label}
        </span>
        {metric.targetText && (
          <span className="shrink-0 rounded-md border border-current/10 bg-current/5 px-1.5 py-0.5 text-[11px] leading-none text-current/65">
            {metric.targetText}
          </span>
        )}
      </span>
      <span className="relative block h-1.5 overflow-visible rounded-full bg-current/10">
        <span
          className={[
            "absolute inset-y-0 left-0 rounded-full shadow-[0_0_8px_color-mix(in_oklab,currentColor_28%,transparent)]",
            taskMetricFillClassName(status),
          ].join(" ")}
          style={{ width: `${valuePercent}%` }}
        />
        {targetPercent !== undefined && (
          <span
            className="absolute top-1/2 block h-3 w-px -translate-y-1/2 rounded-full bg-current/55"
            style={{ left: `${targetPercent}%` }}
            aria-hidden="true"
          />
        )}
      </span>
    </span>
  );
};

const TaskCard = ({
  data,
  conditionText,
  onClick,
}: {
  data: TaskCardData;
  conditionText: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    className="block w-full min-w-0 rounded-lg border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] px-3 py-3 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={onClick}
  >
    <span className="flex min-w-0 items-start justify-between gap-3">
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold leading-5">
            {data.task.title}
          </span>
          <TaskStatusPill status={data.status} />
        </span>
        <span className="mt-1 block truncate text-xs leading-5 text-current/60">
          条件：{conditionText}
        </span>
      </span>
      {data.metric && (
        <span className="shrink-0 text-right">
          <span className="block text-[11px] leading-none text-current/60">当前</span>
          <span className="mt-1 block text-[13px] font-semibold leading-none text-primary tabular-nums">
            {data.metric.valueText}
          </span>
        </span>
      )}
    </span>
    {data.metric && (
      <TaskMetricTrack metric={data.metric} status={data.status} />
    )}
  </button>
);

const TasksSection = ({
  taskCards,
  onOpenTasksDetail,
}: {
  taskCards: TaskCardDisplayData[];
  onOpenTasksDetail: () => void;
}) => (
  <SectionCard className="space-y-3 px-3 py-3">
    <CardHeading icon={Flag}>当前任务</CardHeading>
    {taskCards.length > 0 ? (
      <div className="space-y-2">
        {taskCards.map((taskCard) => (
          <TaskCard
            key={taskCard.data.task.id}
            data={taskCard.data}
            conditionText={taskCard.conditionText}
            onClick={onOpenTasksDetail}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-lg border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] px-3 py-4 text-center text-xs text-current/60">
        当前没有进行中的任务。
      </div>
    )}
  </SectionCard>
);

const DetailRow = ({
  icon: Icon,
  title,
  summary,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] px-3 py-2.5 text-left text-current transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={onClick}
  >
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="size-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold leading-5">{title}</span>
      <span className="mt-0.5 line-clamp-1 block text-[11px] leading-4 text-current/60">
        {summary}
      </span>
    </span>
    <ChevronDown className="size-4 shrink-0 text-current/60" />
  </button>
);

const SceneDetailsSection = ({
  immersiveDescriptionEnabled,
  scene,
  memorySummary,
  identityFactEvents,
  isSending,
  onOpenTipsDetail,
  onOpenScriptReviewDetail,
  onImmersiveDescriptionChange,
}: {
  immersiveDescriptionEnabled: boolean;
  scene: string | undefined;
  memorySummary: string | undefined;
  identityFactEvents: TavernFactEvent[];
  isSending: boolean;
  onOpenTipsDetail: () => void;
  onOpenScriptReviewDetail: () => void;
  onImmersiveDescriptionChange: (checked: boolean) => void;
}) => (
  <SectionCard className="space-y-2 px-3 py-3">
    <CardHeading icon={BookOpen}>场景详情</CardHeading>
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] px-3 py-2.5 text-current">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Eye className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5">沉浸描写</span>
        <span className="mt-0.5 block truncate text-[11px] leading-4 text-current/60">
          动作、神态、感官与环境互动
        </span>
      </span>
      <Switch
        size="sm"
        checked={immersiveDescriptionEnabled}
        disabled={isSending}
        aria-label="切换沉浸描写"
        onCheckedChange={onImmersiveDescriptionChange}
      />
    </div>
    <DetailRow
      icon={FileText}
      title="场景描述"
      summary={compactText(scene)}
      onClick={onOpenTipsDetail}
    />
    <DetailRow
      icon={Brain}
      title="节点记忆"
      summary={compactText(memorySummary)}
      onClick={onOpenTipsDetail}
    />
    {identityFactEvents.length > 0 && (
      <DetailRow
        icon={ShieldCheck}
        title="我的身份"
        summary={identityFactEvents.slice(0, 2).map((event) => event.evidence).join("；")}
        onClick={onOpenScriptReviewDetail}
      />
    )}
  </SectionCard>
);

type MemoryEditorTarget = "scene" | string;

type MemoryEditorDraft = {
  required: string;
  upstream: string;
  public: string;
  private: string;
  known: string;
  privateSelf: string;
  directorSecret: string;
};

type PromptOverrideDraft = {
  bridge: string;
  director: string;
  character: string;
};

const createMemoryEditorDraft = (
  target: MemoryEditorTarget,
  activeRoom: TavernRoom,
): MemoryEditorDraft => {
  const activeInstance = activeRoom.sceneInstances.find((instance) =>
    instance.id === activeRoom.activeSceneInstanceId
  );
  if (target === "scene") {
    const layers = activeInstance?.memoryLayers;
    return {
      required: layers?.required ?? "",
      upstream: layers?.upstream ?? "",
      public: layers?.public ?? "",
      private: layers?.private ?? "",
      known: "",
      privateSelf: "",
      directorSecret: layers?.directorSecret ?? "",
    };
  }

  const layers = activeInstance?.characterMemoryLayers?.[target];
  return {
    required: layers?.required ?? "",
    upstream: "",
    public: layers?.public ?? "",
    private: "",
    known: layers?.known ?? "",
    privateSelf: layers?.privateSelf ?? "",
    directorSecret: layers?.directorSecret ?? "",
  };
};

const createPromptOverrideDraft = (activeRoom: TavernRoom): PromptOverrideDraft => {
  const activeInstance = activeRoom.sceneInstances.find((instance) =>
    instance.id === activeRoom.activeSceneInstanceId
  );
  const blockByTarget = new Map(
    (activeInstance?.promptOverrides?.blocks ?? [])
      .map((block) => [block.target, block.text] as const),
  );

  return {
    bridge: blockByTarget.get("bridge") ?? "",
    director: blockByTarget.get("director") ?? "",
    character: blockByTarget.get("character") ?? "",
  };
};

const createPromptOverrideBlocks = (
  draft: PromptOverrideDraft,
): TavernPromptBlock[] => ([
  ["bridge", "底层会话"] as const,
  ["director", "导演"] as const,
  ["character", "角色"] as const,
]).flatMap(([target, label], index) => {
  const text = draft[target].trim();
  return text
    ? [{
        id: `node-prompt-override:${target}`,
        target,
        label: `节点风格补充：${label}`,
        text,
        enabled: true,
        order: 9000 + index,
        source: {
          type: "custom",
          id: "node-prompt-override",
          label: "节点风格补充",
        },
      }]
    : [];
});

const ToolActionsSection = ({
  isBusy,
  isTrackingProgress,
  hasSecrets,
  onTrackRecentProgress,
  onRebuildProgress,
  onOpenMemoryEditor,
  onOpenPromptOverrideEditor,
  onOpenRecordSecret,
  onOpenRevealSecret,
}: {
  isBusy: boolean;
  isTrackingProgress: boolean;
  hasSecrets: boolean;
  onTrackRecentProgress: () => void;
  onRebuildProgress: () => void;
  onOpenMemoryEditor: () => void;
  onOpenPromptOverrideEditor: () => void;
  onOpenRecordSecret: () => void;
  onOpenRevealSecret: () => void;
}) => (
  <SectionCard className="space-y-2.5 px-3 py-3">
    <CardHeading icon={Sparkles}>工具操作</CardHeading>
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onTrackRecentProgress}
      >
        {isTrackingProgress ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        更新状态
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onRebuildProgress}
      >
        <RefreshCcw className="size-3.5" />
        重建状态
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onOpenMemoryEditor}
      >
        <Brain className="size-3.5" />
        编辑记忆
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onOpenPromptOverrideEditor}
      >
        <FileText className="size-3.5" />
        节点提示
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onOpenRecordSecret}
      >
        <LockKeyhole className="size-3.5" />
        记录秘密
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy || !hasSecrets}
        onClick={onOpenRevealSecret}
      >
        <Eye className="size-3.5" />
        解密秘密
      </Button>
    </div>
  </SectionCard>
);

export const SceneOverviewSection = ({
  externalBusy,
  onBusyChange,
  onOpenTasksDetail,
  onOpenTipsDetail,
  onOpenScriptReviewDetail,
}: SceneOverviewSectionProps) => {
  const {
    activeRoom,
    workspace,
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    isSending,
    patchRoom,
    appendMessagesToRoom,
    appendProgressCheckpointToRoom,
    reportError,
    resetExecutionTrace,
    patchExecutionStep,
    setExecutionTraceAnchorMessageId,
  } = useTavernPageContext();
  const [isTrackingProgress, setIsTrackingProgress] = useState(false);
  const [secretDialogMode, setSecretDialogMode] = useState<"record" | "reveal" | null>(null);
  const [secretDraftText, setSecretDraftText] = useState("");
  const [secretDraftTarget, setSecretDraftTarget] = useState("scene");
  const [selectedSecretId, setSelectedSecretId] = useState("");
  const [revealVisibility, setRevealVisibility] = useState<"public" | "character">("public");
  const [revealCharacterId, setRevealCharacterId] = useState("");
  const [isMemoryDialogOpen, setIsMemoryDialogOpen] = useState(false);
  const [memoryEditorTarget, setMemoryEditorTarget] = useState<MemoryEditorTarget>("scene");
  const [memoryEditorDraft, setMemoryEditorDraft] = useState<MemoryEditorDraft>({
    required: "",
    upstream: "",
    public: "",
    private: "",
    known: "",
    privateSelf: "",
    directorSecret: "",
  });
  const [isPromptOverrideDialogOpen, setIsPromptOverrideDialogOpen] = useState(false);
  const [promptOverrideDraft, setPromptOverrideDraft] = useState<PromptOverrideDraft>({
    bridge: "",
    director: "",
    character: "",
  });

  useEffect(() => {
    onBusyChange?.(isTrackingProgress);
  }, [isTrackingProgress, onBusyChange]);

  useEffect(() => () => {
    onBusyChange?.(false);
  }, [onBusyChange]);

  if (!activeRoom) {
    return null;
  }

  const isBusy = isSending || externalBusy || isTrackingProgress;
  const userPersonaName = activeRoom.userPersonaName.trim();
  const activeScene = activeRoom.scenes?.find((scene) => scene.id === activeRoom.activeSceneId);
  const sceneOverviewTitle =
    getTavernSceneInstanceDisplayTitle(activeRoom, activeRoom.activeSceneInstanceId, "") ||
    getTavernSceneDisplayTitle(activeRoom, activeScene?.id, "") ||
    activeRoom.sceneStatus?.location?.trim() ||
    activeRoom.title.trim() ||
    "当前场景";
  const sceneOverviewPhase =
    activeRoom.sceneStatus?.scenePhase?.trim() ||
    activeRoom.sceneStatus?.atmosphere?.trim() ||
    activeRoom.sceneStatus?.timeLabel?.trim() ||
    "进行中";
  const sceneStatusItems = [
    `回复方式：${replyModeDescriptions[activeRoom.replyMode ?? "active"]}`,
    userPersonaName && userPersonaName !== "我" ? `你的称呼：${userPersonaName}` : "",
    `沉浸描写：${activeRoom.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}`,
    `生成过程：${activeRoom.settings.showExecutionTrace ? "显示" : "隐藏"}`,
    `自动整理资产：${activeRoom.settings.autoAssetExtractionEnabled ? "开启" : "关闭"}`,
  ].filter(Boolean);
  const characterNameById = new Map(roomCharacters.map((character) => [character.id, character.name]));
  const branchSecretOptions = listTavernBranchSecretMemoryEntries(activeRoom);
  const memoryOverviewSummary = buildTavernMemoryOverviewSummary(activeRoom, roomCharacters);
  const statusDefinitionById = new Map(activeRoom.statusDefinitions.map((definition) => [definition.id, definition]));
  const pendingStatusEvents = activeRoom.statusEvents
    .filter((event) => event.status === "pending")
    .filter((event) => {
      const visibility = statusDefinitionById.get(event.statusId)?.visibility;
      return isTavernProgressVisibilityVisibleToUser(visibility ?? "public");
    })
    .slice(-6);
  const sidePanelStatusItems = getProgressStatusItems(activeRoom.progressViews, "sidePanel");
  const sidePanelSituationMetrics = sidePanelStatusItems
    .flatMap((item) => {
      const definition = statusDefinitionById.get(item.statusId);
      if (
        !definition ||
        !isTavernProgressVisibilityVisibleToUser(definition.visibility) ||
        !["global", "scene", "party"].includes(definition.scope)
      ) {
        return [];
      }
      const metric = createResolvedStatusMetric({ activeRoom, definition, item });
      return metric ? [metric] : [];
    });
  const situationMetric =
    sidePanelSituationMetrics
      .filter((metric) => shouldUseSituationMetric(metric, activeRoom))
      .find((metric) => /威胁|风险|危机|局势/.test(metric.definition.label)) ??
    sidePanelSituationMetrics.find((metric) => shouldUseSituationMetric(metric, activeRoom)) ??
    null;
  const visibleTaskDefinitions = activeRoom.taskDefinitions.filter((task) =>
    isTavernProgressVisibilityVisibleToUser(task.visibility)
  );
  const activeTaskCards: TaskCardData[] = visibleTaskDefinitions
    .map((task) => {
      const state = activeRoom.taskSnapshot[task.id];
      const status = state?.status ?? task.lifecycle.initialStatus;
      const progressDisplay = resolveTaskProgressDisplay({
        activeRoom,
        task,
        state,
        characterNameById,
        statusDefinitionById,
      });
      return {
        task,
        state,
        status,
        ...progressDisplay,
      };
    })
    .filter((item) => item.status !== "inactive")
    .slice(0, 4);
  const identityFactEvents = filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: { type: "user" },
  }).filter((event) => event.visibleToUser || event.visibility !== "public").filter(isIdentityFactEvent);
  const sceneOverviewTaskCards = activeTaskCards.map((data) => ({
    data,
    conditionText: formatTaskConditionCardText(
      data.task.lifecycle.completeCondition,
      characterNameById,
      statusDefinitionById,
    ),
  }));

  const trackRecentProgress = async () => {
    if (isBusy) {
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再更新状态。");
      return;
    }

    if (!runtimeAgentId) {
      reportError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (roomCharacters.length === 0) {
      reportError("当前房间还没有可更新状态的角色。");
      return;
    }

    if (activeRoom.statusDefinitions.length === 0 || activeRoom.statusRules.length === 0) {
      reportError("当前房间还没有状态定义或状态规则。");
      return;
    }

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      reportError("当前房间还没有可更新状态的对话。");
      return;
    }

    const progressTurnId = sourceMessages.at(-1)?.turnId ?? sourceMessages.at(-1)?.id ?? `manual-${Date.now()}`;
    setIsTrackingProgress(true);
    reportError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(sourceMessages.at(-1)?.id ?? "");
      resetExecutionTrace([{
        id: "manual-progress-tracking",
        label: "手动更新状态",
        detail: "从最近对话中抽取事实事件并应用状态规则。",
        status: "running",
      }]);
    }

    try {
      const factEvents = await runTavernProgressTracking({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: "手动更新最近对话中的状态、任务与结局。",
        turnId: progressTurnId,
      });

      if (factEvents.length === 0) {
        patchExecutionStep("manual-progress-tracking", {
          status: "done",
          detail: "最近对话没有明确状态事件。",
        });
        toast.info("最近对话没有明确状态事件。");
        return;
      }

      const progressPatch = advanceTavernProgressFromFactEvents({
        room: activeRoom,
        factEvents,
        turnId: progressTurnId,
        createdAt: Date.now(),
      });
      const { actionMessages, ...progressRoomPatch } = progressPatch;
      const progressedRoom = appendProgressCheckpointToRoom(
        syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(activeRoom),
          ...progressRoomPatch,
          updatedAt: Date.now(),
        }),
        "manual",
        progressTurnId,
      );
      patchRoom(activeRoom.id, {
        ...progressRoomPatch,
        statusCheckpoints: progressedRoom.statusCheckpoints,
      });
      if (actionMessages.length > 0) {
        appendMessagesToRoom(activeRoom.id, actionMessages);
      }
      patchExecutionStep("manual-progress-tracking", {
        status: "done",
        detail: `已抽取 ${factEvents.length} 个事实事件。`,
      });
      toast.success("状态面板已更新。");
    } catch (progressError) {
      patchExecutionStep("manual-progress-tracking", {
        status: "error",
        detail: getErrorMessage(progressError),
      });
      reportError(`状态更新失败：${getErrorMessage(progressError)}`);
    } finally {
      setIsTrackingProgress(false);
    }
  };

  const rebuildProgressFromHistory = () => {
    const rebuiltProgress = rebuildTavernProgressFromHistory({
      room: activeRoom,
      createdAt: Date.now(),
    });
    const rebuiltRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...rebuiltProgress,
        updatedAt: Date.now(),
      }),
      "rebuild",
      rebuiltProgress.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...rebuiltProgress,
      statusCheckpoints: rebuiltRoom.statusCheckpoints,
    });
    toast.success("状态面板已从 checkpoint 和事件历史重建。");
  };

  const resolvePendingStatusEvent = (
    statusEventId: string,
    resolution: "applied" | "rejected",
  ) => {
    const progressPatch = resolveTavernPendingStatusEvent({
      room: activeRoom,
      statusEventId,
      resolution,
      createdAt: Date.now(),
    });
    if (!progressPatch) {
      reportError("未找到可处理的待确认状态事件。");
      return;
    }

    const { actionMessages, ...progressRoomPatch } = progressPatch;
    const progressedRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...progressRoomPatch,
        updatedAt: Date.now(),
      }),
      "manual",
      progressRoomPatch.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...progressRoomPatch,
      statusCheckpoints: progressedRoom.statusCheckpoints,
    });
    if (actionMessages.length > 0) {
      appendMessagesToRoom(activeRoom.id, actionMessages);
    }
    toast.success(resolution === "applied" ? "状态事件已应用。" : "状态事件已拒绝。");
  };

  const openMemoryEditor = () => {
    setMemoryEditorTarget("scene");
    setMemoryEditorDraft(createMemoryEditorDraft("scene", activeRoom));
    setIsMemoryDialogOpen(true);
  };

  const changeMemoryEditorTarget = (target: MemoryEditorTarget) => {
    setMemoryEditorTarget(target);
    setMemoryEditorDraft(createMemoryEditorDraft(target, activeRoom));
  };

  const closeMemoryEditor = () => {
    setIsMemoryDialogOpen(false);
  };

  const saveMemoryEditor = () => {
    if (memoryEditorTarget === "scene") {
      const nextRoom = updateTavernActiveSceneMemoryLayers(activeRoom, {
        required: memoryEditorDraft.required.trim(),
        upstream: memoryEditorDraft.upstream.trim(),
        public: memoryEditorDraft.public.trim(),
        private: memoryEditorDraft.private.trim(),
        directorSecret: memoryEditorDraft.directorSecret.trim(),
      } satisfies Partial<TavernSceneMemoryLayers>);
      patchRoom(activeRoom.id, nextRoom);
      toast.success("当前节点场景记忆已更新。");
      closeMemoryEditor();
      return;
    }

    const nextRoom = updateTavernActiveCharacterMemoryLayers(activeRoom, memoryEditorTarget, {
      required: memoryEditorDraft.required.trim(),
      public: memoryEditorDraft.public.trim(),
      known: memoryEditorDraft.known.trim(),
      privateSelf: memoryEditorDraft.privateSelf.trim(),
      directorSecret: memoryEditorDraft.directorSecret.trim(),
    } satisfies Partial<TavernCharacterMemoryLayers>);
    patchRoom(activeRoom.id, nextRoom);
    toast.success("当前节点角色记忆已更新。");
    closeMemoryEditor();
  };

  const openPromptOverrideEditor = () => {
    setPromptOverrideDraft(createPromptOverrideDraft(activeRoom));
    setIsPromptOverrideDialogOpen(true);
  };

  const closePromptOverrideEditor = () => {
    setIsPromptOverrideDialogOpen(false);
  };

  const savePromptOverrideEditor = () => {
    const nextRoom = updateTavernActiveScenePromptOverrides(activeRoom, {
      version: 1,
      blocks: createPromptOverrideBlocks(promptOverrideDraft),
    });
    patchRoom(activeRoom.id, nextRoom);
    toast.success("当前节点提示词补充已更新。");
    closePromptOverrideEditor();
  };

  const closeSecretDialog = () => {
    setSecretDialogMode(null);
    setSecretDraftText("");
  };
  const openRecordSecretDialog = () => {
    setSecretDraftTarget("scene");
    setSecretDraftText("");
    setSecretDialogMode("record");
  };
  const openRevealSecretDialog = () => {
    setSelectedSecretId((current) =>
      branchSecretOptions.some((option) => option.secretId === current)
        ? current
        : branchSecretOptions[0]?.secretId ?? ""
    );
    setRevealVisibility("public");
    setRevealCharacterId(roomCharacters[0]?.id ?? "");
    setSecretDialogMode("reveal");
  };
  const recordSecretMemory = () => {
    const result = addTavernSecretMemoryEntry(activeRoom, {
      target: secretDraftTarget === "scene"
        ? { type: "scene" }
        : { type: "character", characterId: secretDraftTarget },
      text: secretDraftText,
    });
    if (!result.entry) {
      return;
    }

    patchRoom(activeRoom.id, result.room);
    toast.success("已记录当前节点秘密");
    closeSecretDialog();
  };
  const revealSecretMemory = () => {
    const secretOption = branchSecretOptions.find((option) => option.secretId === selectedSecretId);
    if (!secretOption) {
      return;
    }
    const result = revealTavernSecretMemory(activeRoom, {
      secretId: secretOption.secretId,
      visibility: revealVisibility,
      targetCharacterIds: revealVisibility === "character" ? [revealCharacterId] : [],
    });
    if (!result.reveal) {
      return;
    }

    const refreshed = loadTavernBranchUpstreamMemory(result.room);
    patchRoom(activeRoom.id, refreshed.room);
    toast.success(revealVisibility === "public" ? "秘密已公开" : "秘密已对角色解密");
    closeSecretDialog();
  };

  return (
    <section className="space-y-4">
      <OverviewHeader
        sceneTitle={sceneOverviewTitle}
        scenePhase={sceneOverviewPhase}
        sceneStatusItems={sceneStatusItems}
      />
      <GoalCard sceneGoal={activeRoom.sceneGoal} />
      {situationMetric && (
        <SituationCard metric={situationMetric} />
      )}
      <PendingStatusEvents
        events={pendingStatusEvents}
        statusDefinitionById={statusDefinitionById}
        isBusy={isBusy}
        onResolve={resolvePendingStatusEvent}
      />
      <TasksSection
        taskCards={sceneOverviewTaskCards}
        onOpenTasksDetail={onOpenTasksDetail}
      />
      <SceneDetailsSection
        immersiveDescriptionEnabled={activeRoom.settings.immersiveDescriptionEnabled}
        scene={activeRoom.scene}
        memorySummary={memoryOverviewSummary}
        identityFactEvents={identityFactEvents}
        isSending={isSending}
        onOpenTipsDetail={onOpenTipsDetail}
        onOpenScriptReviewDetail={onOpenScriptReviewDetail}
        onImmersiveDescriptionChange={(checked) => patchRoom(activeRoom.id, {
          settings: {
            ...activeRoom.settings,
            immersiveDescriptionEnabled: checked,
          },
        })}
      />
      <ToolActionsSection
        isBusy={isBusy}
        isTrackingProgress={isTrackingProgress}
        hasSecrets={branchSecretOptions.length > 0}
        onTrackRecentProgress={() => void trackRecentProgress()}
        onRebuildProgress={rebuildProgressFromHistory}
        onOpenMemoryEditor={openMemoryEditor}
        onOpenPromptOverrideEditor={openPromptOverrideEditor}
        onOpenRecordSecret={openRecordSecretDialog}
        onOpenRevealSecret={openRevealSecretDialog}
      />
      <Dialog
        open={isMemoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeMemoryEditor();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑节点记忆</DialogTitle>
            <DialogDescription>
              只修改当前节点实例的场景/角色记忆层；底层规范、视角和输出协议不在这里开放编辑。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <NativeSelect
              value={memoryEditorTarget}
              onChange={(event) => changeMemoryEditorTarget(event.currentTarget.value)}
            >
              <NativeSelectOption value="scene">当前场景</NativeSelectOption>
              {roomCharacters.map((character) => (
                <NativeSelectOption key={character.id} value={character.id}>
                  {character.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">必须记忆</span>
                <Textarea
                  value={memoryEditorDraft.required}
                  className="min-h-24 resize-none"
                  onChange={(event) => setMemoryEditorDraft((draft) => ({
                    ...draft,
                    required: event.target.value,
                  }))}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {memoryEditorTarget === "scene" ? "公开记忆" : "角色公开记忆"}
                </span>
                <Textarea
                  value={memoryEditorDraft.public}
                  className="min-h-24 resize-none"
                  onChange={(event) => setMemoryEditorDraft((draft) => ({
                    ...draft,
                    public: event.target.value,
                  }))}
                />
              </label>
              {memoryEditorTarget === "scene" ? (
                <>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">上游汇总</span>
                    <Textarea
                      value={memoryEditorDraft.upstream}
                      className="min-h-24 resize-none"
                      onChange={(event) => setMemoryEditorDraft((draft) => ({
                        ...draft,
                        upstream: event.target.value,
                      }))}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">分支私有</span>
                    <Textarea
                      value={memoryEditorDraft.private}
                      className="min-h-24 resize-none"
                      onChange={(event) => setMemoryEditorDraft((draft) => ({
                        ...draft,
                        private: event.target.value,
                      }))}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">角色已知</span>
                    <Textarea
                      value={memoryEditorDraft.known}
                      className="min-h-24 resize-none"
                      onChange={(event) => setMemoryEditorDraft((draft) => ({
                        ...draft,
                        known: event.target.value,
                      }))}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">角色私有</span>
                    <Textarea
                      value={memoryEditorDraft.privateSelf}
                      className="min-h-24 resize-none"
                      onChange={(event) => setMemoryEditorDraft((draft) => ({
                        ...draft,
                        privateSelf: event.target.value,
                      }))}
                    />
                  </label>
                </>
              )}
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">导演秘密</span>
              <Textarea
                value={memoryEditorDraft.directorSecret}
                className="min-h-20 resize-none"
                onChange={(event) => setMemoryEditorDraft((draft) => ({
                  ...draft,
                  directorSecret: event.target.value,
                }))}
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeMemoryEditor}>
              取消
            </Button>
            <Button type="button" onClick={saveMemoryEditor}>
              保存记忆
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isPromptOverrideDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePromptOverrideEditor();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>节点提示词补充</DialogTitle>
            <DialogDescription>
              当前节点会继承酒馆级预设；这里只追加局部风格/调度补充，不修改底层视角、输出协议和可见性规范。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">角色 Agent 补充</span>
              <Textarea
                value={promptOverrideDraft.character}
                className="min-h-24 resize-none"
                onChange={(event) => setPromptOverrideDraft((draft) => ({
                  ...draft,
                  character: event.target.value,
                }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">导演 Agent 补充</span>
              <Textarea
                value={promptOverrideDraft.director}
                className="min-h-24 resize-none"
                onChange={(event) => setPromptOverrideDraft((draft) => ({
                  ...draft,
                  director: event.target.value,
                }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Bridge 补充</span>
              <Textarea
                value={promptOverrideDraft.bridge}
                className="min-h-20 resize-none"
                onChange={(event) => setPromptOverrideDraft((draft) => ({
                  ...draft,
                  bridge: event.target.value,
                }))}
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closePromptOverrideEditor}>
              取消
            </Button>
            <Button type="button" onClick={savePromptOverrideEditor}>
              保存补充
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={secretDialogMode === "record"}
        onOpenChange={(open) => {
          if (!open) {
            closeSecretDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>记录秘密</DialogTitle>
            <DialogDescription>
              保存到当前节点场景实例，默认只作为隐藏记忆，之后可公开或对指定角色解密。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <NativeSelect
              value={secretDraftTarget}
              onChange={(event) => setSecretDraftTarget(event.target.value)}
            >
              <NativeSelectOption value="scene">场景秘密</NativeSelectOption>
              {roomCharacters.map((character) => (
                <NativeSelectOption key={character.id} value={character.id}>
                  {character.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Textarea
              value={secretDraftText}
              className="min-h-28 resize-none"
              placeholder="写下暂不公开的事实、身份、暗号、动机或只应由导演掌握的信息。"
              onChange={(event) => setSecretDraftText(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeSecretDialog}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!secretDraftText.trim()}
              onClick={recordSecretMemory}
            >
              <Check className="size-3.5" />
              记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={secretDialogMode === "reveal"}
        onOpenChange={(open) => {
          if (!open) {
            closeSecretDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>解密秘密</DialogTitle>
            <DialogDescription>
              在当前节点场景实例写入解密标记；重新加载上游记忆时会按公开或指定角色可见规则汇总。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <NativeSelect
              value={selectedSecretId}
              onChange={(event) => setSelectedSecretId(event.target.value)}
            >
              {branchSecretOptions.map((option) => (
                <NativeSelectOption key={`${option.sourceInstanceId}:${option.secretId}`} value={option.secretId}>
                  {option.sourceTitle} · {option.target === "character"
                    ? characterNameById.get(option.characterId ?? "") ?? "角色秘密"
                    : "场景秘密"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="rounded-md border border-current/10 bg-current/[0.04] px-3 py-2 text-xs leading-5 text-current/75">
              {branchSecretOptions.find((option) => option.secretId === selectedSecretId)?.text ?? "暂无可解密秘密。"}
            </div>
            <NativeSelect
              value={revealVisibility}
              onChange={(event) => setRevealVisibility(
                event.target.value === "character" ? "character" : "public",
              )}
            >
              <NativeSelectOption value="public">公开给当前分支</NativeSelectOption>
              <NativeSelectOption value="character">只对指定角色解密</NativeSelectOption>
            </NativeSelect>
            {revealVisibility === "character" && (
              <NativeSelect
                value={revealCharacterId}
                onChange={(event) => setRevealCharacterId(event.target.value)}
              >
                {roomCharacters.map((character) => (
                  <NativeSelectOption key={character.id} value={character.id}>
                    {character.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeSecretDialog}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!selectedSecretId || (revealVisibility === "character" && !revealCharacterId)}
              onClick={revealSecretMemory}
            >
              <Eye className="size-3.5" />
              解密
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
