import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  ListChecks,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";

export type ExecutionStep = {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
};

type ExecutionTraceProps = {
  steps: ExecutionStep[];
  visualPreset: VisualPresetDefinition;
  statusText?: string;
};

const statusMeta = {
  pending: {
    label: "等待",
    icon: Circle,
    className: "text-muted-foreground dark:text-zinc-300",
  },
  running: {
    label: "执行中",
    icon: Loader2,
    className: "text-primary",
  },
  done: {
    label: "完成",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  skipped: {
    label: "跳过",
    icon: Circle,
    className: "text-muted-foreground dark:text-zinc-300",
  },
  error: {
    label: "失败",
    icon: AlertCircle,
    className: "text-destructive",
  },
} as const;

const getStepDetail = (step: ExecutionStep) => {
  if (step.status === "done" && step.id.startsWith("speaker-")) {
    return "已生成角色回复。";
  }

  return step.detail ?? "";
};

export const ExecutionTrace = ({
  steps,
  visualPreset,
  statusText,
}: ExecutionTraceProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const stepKey = useMemo(
    () => steps.map((step) => `${step.id}:${step.status}`).join("|"),
    [steps],
  );
  const activeStatusText = statusText?.trim() ?? "";
  const runningStep = steps.find((step) => step.status === "running");
  const errorStep = steps.find((step) => step.status === "error");
  const doneCount = steps.filter((step) => step.status === "done").length;
  const hasActiveStep = Boolean(runningStep || errorStep || activeStatusText);
  const summary = errorStep
    ? `${errorStep.label}失败`
    : activeStatusText || (runningStep
      ? `正在${runningStep.label}`
      : `${doneCount}/${steps.length} 步完成`);

  useEffect(() => {
    setIsExpanded(hasActiveStep);
  }, [hasActiveStep, stepKey]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="group/message flex justify-start">
      <div className="flex w-full max-w-[min(84%,720px)] gap-3">
        <div className="size-10 shrink-0" aria-hidden />
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden border text-xs shadow-lg",
            visualPreset.tavern.sceneCard,
          )}
        >
          <button
            type="button"
            className={cn(
              "relative flex min-h-8 w-full min-w-0 items-center py-1.5 transition-colors hover:bg-current/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isExpanded ? "gap-2 px-2.5 text-left" : "justify-center px-10 text-center",
            )}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? (
              <>
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center",
                    visualPreset.tavern.sceneBadge,
                  )}
                  aria-hidden
                >
                  <ListChecks className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">生成过程</span>
                <span
                  className={cn(
                    "max-w-[62%] shrink-0 truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
                    errorStep
                      ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
                      : visualPreset.tavern.sceneBadge,
                  )}
                >
                  {summary}
                </span>
              </>
            ) : (
              <span className="flex min-w-0 max-w-full items-center justify-center gap-2">
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center",
                    visualPreset.tavern.sceneBadge,
                  )}
                  aria-hidden
                >
                  <ListChecks className="size-3.5" />
                </span>
                <span className="shrink-0">生成过程</span>
                <span
                  className={cn(
                    "min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
                    errorStep
                      ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
                      : visualPreset.tavern.sceneBadge,
                  )}
                >
                  {summary}
                </span>
              </span>
            )}
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 opacity-70 transition-transform",
                !isExpanded && "absolute right-2.5",
                isExpanded && "rotate-180",
              )}
            />
          </button>

          {isExpanded && (
            <div className="space-y-1 border-t border-current/10 px-2.5 py-1.5">
              {steps.map((step) => {
                const meta = statusMeta[step.status];
                const Icon = meta.icon;
                const detail = step.status === "running" && activeStatusText
                  ? activeStatusText
                  : getStepDetail(step);
                const statusClassName = step.status === "running"
                  ? "text-current opacity-85"
                  : meta.className;

                return (
                  <div key={step.id} className="flex min-w-0 items-start gap-2 rounded-md px-1 py-0.5">
                    <Icon
                      className={cn(
                        "mt-1 size-3 shrink-0",
                        statusClassName,
                        step.status === "running" && "animate-spin",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-current">{step.label}</span>
                        <span className={cn("shrink-0 text-[11px]", statusClassName)}>
                          {meta.label}
                        </span>
                      </div>
                      {detail && (
                        <div className="line-clamp-1 leading-5 text-current opacity-70">
                          {detail}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
