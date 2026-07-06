import {
  Brain,
  HeartPulse,
  ShieldQuestion,
  Smile,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TavernStatusValue } from "@/features/pages/taverns/tavern/types";
import { MeterBar } from "../shared";
import type { ResolvedStatusMetric } from "../types";

const formatStatusValue = (
  value: TavernStatusValue,
  metric: ResolvedStatusMetric,
) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "无";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  if (typeof value === "string" && metric.definition.enumOptions?.length) {
    return metric.definition.enumOptions.find((option) => option.value === value)?.label ?? value;
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
  if (/好感|亲密|信任|关系/.test(label)) {
    return Smile;
  }
  if (/疑|警惕|戒备|风险/.test(label)) {
    return ShieldQuestion;
  }
  return Brain;
};

export const formatMetricValue = (metric: ResolvedStatusMetric) =>
  formatStatusValue(metric.value, metric);

export const CharacterMetricView = ({
  metric,
  variant = "compact",
}: {
  metric: ResolvedStatusMetric;
  variant?: "compact" | "featured";
}) => {
  const Icon = resolveMetricIcon(metric.definition.label);
  const value = formatMetricValue(metric);
  const isNumeric = typeof metric.value === "number";
  const maxValue = metricMaxValue(metric);

  if (variant === "featured") {
    return (
      <div className="min-w-0 rounded-lg border border-current/10 bg-current/[0.065] dark:bg-current/[0.09] px-2 py-1.5 shadow-sm">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-current/75">
            <Icon className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{metric.definition.label}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums">
            {value}
            {isNumeric && (
              <span className="ml-0.5 text-[11px] font-normal text-current/65">/{maxValue}</span>
            )}
          </span>
        </div>
        {isNumeric && (
          <div className="mt-1.5">
            <MeterBar percent={metric.percent} />
          </div>
        )}
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
          {isNumeric && (
            <span className="ml-0.5 text-[11px] font-normal text-current/60">/{maxValue}</span>
          )}
        </span>
      </div>
      {isNumeric && <MeterBar percent={metric.percent} />}
    </div>
  );
};
