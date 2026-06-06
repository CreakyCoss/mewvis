import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TavernExecutionStep = {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "running" | "done" | "error";
};

type TavernExecutionTraceProps = {
  steps: TavernExecutionStep[];
};

const statusMeta = {
  pending: {
    label: "等待",
    icon: Circle,
    className: "text-muted-foreground",
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
  error: {
    label: "失败",
    icon: AlertCircle,
    className: "text-destructive",
  },
} as const;

export const TavernExecutionTrace = ({ steps }: TavernExecutionTraceProps) => {
  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="self-stretch rounded-md border bg-background/85 p-3 shadow-sm">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">执行过程</div>
      <div className="space-y-2">
        {steps.map((step) => {
          const meta = statusMeta[step.status];
          const Icon = meta.icon;

          return (
            <div key={step.id} className="flex min-w-0 items-start gap-2">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  meta.className,
                  step.status === "running" && "animate-spin",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{step.label}</span>
                  <span className={cn("shrink-0 text-[11px]", meta.className)}>
                    {meta.label}
                  </span>
                </div>
                {step.detail && (
                  <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
