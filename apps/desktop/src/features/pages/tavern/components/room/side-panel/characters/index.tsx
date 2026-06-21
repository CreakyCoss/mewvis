import {
  Brain,
  ChevronRight,
  HeartPulse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import {
  HoverCard,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { TavernCharacter, TavernStatusValue } from "../../../../types";
import { MeterBar } from "../shared";
import type { ResolvedStatusMetric } from "../types";
import { CharacterDetail } from "./detail";

const formatMetricValue = (value: TavernStatusValue) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "无";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  if (typeof value === "number") {
    return String(Math.round(value));
  }
  return value === null || value === "" ? "未记录" : String(value);
};

const metricMaxValue = (metric: ResolvedStatusMetric) =>
  typeof metric.definition.max === "number" ? metric.definition.max : 100;

const resolveMetricIcon = (label: string): LucideIcon => {
  if (/健康|生命|体力|伤/.test(label)) {
    return HeartPulse;
  }
  return Brain;
};

const CharacterMetricView = ({
  metric,
  variant = "compact",
}: {
  metric: ResolvedStatusMetric;
  variant?: "compact" | "featured";
}) => {
  const Icon = resolveMetricIcon(metric.definition.label);
  const value = formatMetricValue(metric.value);
  const maxValue = metricMaxValue(metric);

  if (variant === "featured") {
    return (
      <div className="min-w-0 rounded-lg border border-current/10 bg-background/60 px-2.5 py-2 shadow-sm">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-current/75">
            <Icon className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{metric.definition.label}</span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums">
            {value}
            <span className="ml-0.5 text-xs font-normal text-current/55">/{maxValue}</span>
          </span>
        </div>
        <div className="mt-2">
          <MeterBar percent={metric.percent} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1 rounded-md px-0.5">
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-none text-current/70">
          <Icon className="size-3.5 shrink-0 text-primary" />
        <span className="shrink-0">{metric.definition.label}</span>
      </div>
      <div className="flex min-w-0 items-end justify-between gap-1.5">
        <span className="shrink-0 text-[13px] font-semibold leading-none tabular-nums text-current/90">
          {value}
          <span className="ml-0.5 text-[11px] font-normal text-current/50">/{maxValue}</span>
        </span>
      </div>
      <MeterBar percent={metric.percent} />
    </div>
  );
};

const CharacterCardContent = ({
  character,
  isActive,
  metrics,
}: {
  character: TavernCharacter;
  isActive: boolean;
  metrics: ResolvedStatusMetric[];
}) => {
  const avatar = resolveAgentAvatar(character.avatar).src;

  if (isActive) {
    return (
      <span className="block space-y-3">
        <span className="flex min-w-0 items-center gap-3">
          <img
            src={avatar}
            alt=""
            className="size-12 shrink-0 rounded-lg border border-background/70 bg-background/40 object-cover shadow-sm"
          />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center">
              <span className="truncate text-sm font-semibold leading-tight">
                {character.name}
              </span>
            </span>
            <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-current/65">
              {character.speakingStyle || character.description || "当前默认发言角色"}
            </span>
          </span>
        </span>
        {metrics.length > 0 ? (
          <span className="grid grid-cols-2 gap-2">
            {metrics.map((metric) => (
              <CharacterMetricView
                key={metric.key}
                metric={metric}
                variant="featured"
              />
            ))}
          </span>
        ) : (
          <span className="block rounded-lg border border-current/10 bg-background/55 px-3 py-2.5 text-xs text-current/65">
            暂无可见状态
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img
        src={avatar}
        alt=""
        className="size-10 shrink-0 rounded-lg border border-background/70 bg-background/40 object-cover shadow-sm"
      />
      <span className="min-w-[3.5rem] max-w-[4.5rem] truncate text-[13px] font-semibold leading-tight">
        {character.name}
      </span>
      <span className="grid min-w-0 flex-1 grid-cols-2 gap-2.5">
        {metrics.length > 0 ? (
          metrics.map((metric) => (
            <CharacterMetricView key={metric.key} metric={metric} />
          ))
        ) : (
          <span className="col-span-2 text-[11px] text-current/65">暂无可见状态</span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-current/50" />
    </span>
  );
};

export const CharacterStatusRow = ({
  character,
  isActive,
  disabled,
  memory,
  metrics,
  isBusy,
  isCompacting,
  onClick,
  onCompact,
}: {
  character: TavernCharacter;
  isActive: boolean;
  disabled: boolean;
  memory: string;
  metrics: ResolvedStatusMetric[];
  isBusy: boolean;
  isCompacting: boolean;
  onClick: () => void;
  onCompact: () => void;
}) => (
  <HoverCard openDelay={120} closeDelay={120}>
    <HoverCardTrigger asChild>
      <button
        type="button"
        className={cn(
          "w-full min-w-0 rounded-xl border border-current/10 bg-background/45 p-2.5 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          isActive && "border-primary/30 bg-primary/10 ring-1 ring-primary/10",
        )}
        disabled={disabled}
        onClick={onClick}
      >
        <CharacterCardContent
          character={character}
          isActive={isActive}
          metrics={metrics}
        />
      </button>
    </HoverCardTrigger>
    <CharacterDetail
      character={character}
      memory={memory}
      isBusy={isBusy}
      isCompacting={isCompacting}
      onCompact={onCompact}
    />
  </HoverCard>
);
