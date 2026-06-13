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

export const SkillSourceBadge = ({
  source,
  readonly = true,
  systemOnly = false,
}: SkillSourceBadgeProps) => {
  if (systemOnly && source !== "system") {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 border px-2 text-[11px] font-medium",
        sourceBadgeClassName(source, readonly),
      )}
    >
      {sourceLabel(source, readonly)}
    </Badge>
  );
};

const sourceBadgeClassName = (source: string | undefined, readonly: boolean) => {
  if (!readonly) {
    return "border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/15 dark:text-amber-200";
  }

  if (source === "app") {
    return "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/15 dark:text-emerald-200";
  }

  return "border-slate-200/80 bg-slate-100/80 text-slate-600 dark:border-slate-400/20 dark:bg-slate-500/15 dark:text-slate-200";
};
