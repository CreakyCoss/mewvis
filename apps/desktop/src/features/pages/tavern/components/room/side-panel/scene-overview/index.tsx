import type { ReactNode } from "react";
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Flag,
  Loader2,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  TavernFactEvent,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusValue,
} from "../../../../types";
import {
  compactText,
  MeterBar,
} from "../shared";
import type {
  DetailPanelKey,
  ResolvedStatusMetric,
  TaskCardData,
  TaskValueDisplay,
} from "../types";

type TaskCardDisplayData = {
  data: TaskCardData;
  conditionText: string;
};

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
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-background/45 text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  <div className={`rounded-xl border border-current/10 bg-background/35 text-current shadow-sm ${className}`}>
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
        <div className="mt-0.5 text-[11px] leading-4 text-current/55">
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
            <div className="text-[11px] leading-none text-current/50">
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
            <span className="ml-0.5 text-xs text-current/45 tabular-nums">
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
        <div className="mt-1 flex items-center justify-between text-[10px] leading-none text-current/40">
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
              <div className="shrink-0 text-[11px] text-current/55">
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
        <span className="min-w-0 truncate text-[11px] leading-4 text-current/55">
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
    className="block w-full min-w-0 rounded-lg border border-current/10 bg-background/45 px-3 py-3 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <span className="block text-[11px] leading-none text-current/50">当前</span>
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
  onOpenDetail,
}: {
  taskCards: TaskCardDisplayData[];
  onOpenDetail: (detailPanel: DetailPanelKey) => void;
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
            onClick={() => onOpenDetail("tasks-outcomes")}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-lg border border-current/10 bg-background/45 px-3 py-4 text-center text-xs text-current/60">
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
    className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-current/10 bg-background/45 px-3 py-2.5 text-left text-current transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <ChevronDown className="size-4 shrink-0 text-current/50" />
  </button>
);

const SceneDetailsSection = ({
  immersiveDescriptionEnabled,
  scene,
  memory,
  identityFactEvents,
  isSending,
  onOpenDetail,
  onImmersiveDescriptionChange,
}: {
  immersiveDescriptionEnabled: boolean;
  scene: string | undefined;
  memory: string | undefined;
  identityFactEvents: TavernFactEvent[];
  isSending: boolean;
  onOpenDetail: (detailPanel: DetailPanelKey) => void;
  onImmersiveDescriptionChange: (checked: boolean) => void;
}) => (
  <SectionCard className="space-y-2 px-3 py-3">
    <CardHeading icon={BookOpen}>场景详情</CardHeading>
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-current/10 bg-background/45 px-3 py-2.5 text-current">
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
      onClick={() => onOpenDetail("tips")}
    />
    <DetailRow
      icon={Brain}
      title="房间记忆"
      summary={compactText(memory)}
      onClick={() => onOpenDetail("tips")}
    />
    {identityFactEvents.length > 0 && (
      <DetailRow
        icon={ShieldCheck}
        title="我的身份"
        summary={identityFactEvents.slice(0, 2).map((event) => event.evidence).join("；")}
        onClick={() => onOpenDetail("script-review")}
      />
    )}
  </SectionCard>
);

const ToolActionsSection = ({
  isBusy,
  isTrackingProgress,
  onTrackRecentProgress,
  onRebuildProgress,
}: {
  isBusy: boolean;
  isTrackingProgress: boolean;
  onTrackRecentProgress: () => void;
  onRebuildProgress: () => void;
}) => (
  <SectionCard className="space-y-2.5 px-3 py-3">
    <CardHeading icon={Sparkles}>工具操作</CardHeading>
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-background/45 text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
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
        className="h-8 border-primary/35 bg-background/45 text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onRebuildProgress}
      >
        <RefreshCcw className="size-3.5" />
        重建状态
      </Button>
    </div>
  </SectionCard>
);

export const SceneOverviewSection = ({
  sceneTitle,
  scenePhase,
  sceneStatusItems,
  immersiveDescriptionEnabled,
  scene,
  sceneGoal,
  memory,
  identityFactEvents,
  pendingStatusEvents,
  statusDefinitionById,
  isSending,
  isBusy,
  isTrackingProgress,
  situationMetric,
  taskCards,
  onOpenDetail,
  onImmersiveDescriptionChange,
  onTrackRecentProgress,
  onRebuildProgress,
  onResolvePendingStatusEvent,
}: {
  sceneTitle: string;
  scenePhase: string;
  sceneStatusItems: string[];
  immersiveDescriptionEnabled: boolean;
  scene: string | undefined;
  sceneGoal: string | undefined;
  memory: string | undefined;
  identityFactEvents: TavernFactEvent[];
  pendingStatusEvents: TavernStatusEvent[];
  statusDefinitionById: Map<string, TavernStatusDefinition>;
  isSending: boolean;
  isBusy: boolean;
  isTrackingProgress: boolean;
  situationMetric: ResolvedStatusMetric | null;
  taskCards: TaskCardDisplayData[];
  onOpenDetail: (detailPanel: DetailPanelKey) => void;
  onImmersiveDescriptionChange: (checked: boolean) => void;
  onTrackRecentProgress: () => void;
  onRebuildProgress: () => void;
  onResolvePendingStatusEvent: (statusEventId: string, resolution: "applied" | "rejected") => void;
}) => (
  <section className="space-y-4">
    <OverviewHeader
      sceneTitle={sceneTitle}
      scenePhase={scenePhase}
      sceneStatusItems={sceneStatusItems}
    />
    <GoalCard sceneGoal={sceneGoal} />
    {situationMetric && (
      <SituationCard metric={situationMetric} />
    )}
    <PendingStatusEvents
      events={pendingStatusEvents}
      statusDefinitionById={statusDefinitionById}
      isBusy={isBusy}
      onResolve={onResolvePendingStatusEvent}
    />
    <TasksSection
      taskCards={taskCards}
      onOpenDetail={onOpenDetail}
    />
    <SceneDetailsSection
      immersiveDescriptionEnabled={immersiveDescriptionEnabled}
      scene={scene}
      memory={memory}
      identityFactEvents={identityFactEvents}
      isSending={isSending}
      onOpenDetail={onOpenDetail}
      onImmersiveDescriptionChange={onImmersiveDescriptionChange}
    />
    <ToolActionsSection
      isBusy={isBusy}
      isTrackingProgress={isTrackingProgress}
      onTrackRecentProgress={onTrackRecentProgress}
      onRebuildProgress={onRebuildProgress}
    />
  </section>
);
