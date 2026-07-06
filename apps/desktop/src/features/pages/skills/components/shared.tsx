import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sourceLabel } from "./utils";

type SummaryPillProps = {
  label: string;
  value: number;
};

export const SummaryPill = ({ label, value }: SummaryPillProps) => (
  <div className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs text-muted-foreground">
    <span>{label}</span>
    <span className="font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

type EmptyStateProps = {
  icon: ReactNode;
  text: string;
};

export const EmptyState = ({ icon, text }: EmptyStateProps) => (
  <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/15 text-sm text-muted-foreground">
    {icon}
    <span>{text}</span>
  </div>
);

type SkillSourceBadgeProps = {
  source?: string;
  readonly?: boolean;
  systemOnly?: boolean;
};

export const SkillSourceBadge = ({ source, readonly = true, systemOnly = false }: SkillSourceBadgeProps) => {
  if (systemOnly && source !== "system") {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 min-w-[68px] border px-2 text-center text-[11px] font-medium whitespace-nowrap",
        sourceBadgeClassName(source, readonly),
      )}
    >
      {sourceLabel(source, readonly)}
    </Badge>
  );
};

const sourceBadgeClassName = (source: string | undefined, readonly: boolean) => {
  if (!readonly) {
    return "border-amber-300/90 bg-amber-100 text-amber-800 dark:border-amber-300/35 dark:bg-amber-400/20 dark:text-amber-100";
  }

  if (source === "app") {
    return "border-emerald-300/90 bg-emerald-100 text-emerald-800 dark:border-emerald-300/35 dark:bg-emerald-400/20 dark:text-emerald-100";
  }
  if (source === "upload") {
    return "border-violet-300/90 bg-violet-100 text-violet-800 dark:border-violet-300/35 dark:bg-violet-400/20 dark:text-violet-100";
  }

  return "border-slate-200/80 bg-slate-100/80 text-slate-600 dark:border-slate-400/20 dark:bg-slate-500/15 dark:text-slate-200";
};
