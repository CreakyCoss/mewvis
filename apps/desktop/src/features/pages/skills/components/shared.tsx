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
  <div className="app-empty-state flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center">
    <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">{icon}</span>
    <div className="text-sm font-semibold text-foreground">{text}</div>
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
        "h-5 min-w-[68px] border px-2 text-center text-xs font-medium whitespace-nowrap",
        sourceBadgeClassName(source, readonly),
      )}
    >
      {sourceLabel(source, readonly)}
    </Badge>
  );
};

const sourceBadgeClassName = (source: string | undefined, readonly: boolean) => {
  if (!readonly) {
    return "border-warning/25 bg-warning/10 text-warning";
  }

  if (source === "app") {
    return "border-success/25 bg-success/10 text-success";
  }
  if (source === "upload") {
    return "border-chart-3/25 bg-chart-3/10 text-chart-3";
  }

  return "border-border/80 bg-muted/70 text-muted-foreground";
};
