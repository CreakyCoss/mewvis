import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const emptyValueText = "未设置";

export const compactText = (value: string | undefined) => value?.trim() || emptyValueText;

export const TextBlock = ({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) => (
  <div className="space-y-1.5">
    <div className="text-[11px] font-medium text-current opacity-70">{label}</div>
    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-current/10 bg-current/5 px-3 py-2 text-xs leading-5 text-current shadow-sm">
      {compactText(value)}
    </div>
  </div>
);

export const DetailEntry = ({
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
    className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-current/10 bg-background/35 px-3 py-2.5 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={onClick}
  >
    <Icon className="size-4 shrink-0 text-primary" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold leading-5">{title}</span>
      <span className="mt-0.5 block truncate text-[11px] leading-4 opacity-65">{summary}</span>
    </span>
    <ChevronRight className="size-4 shrink-0 opacity-55" />
  </button>
);

export const PanelSectionTitle = ({
  icon: Icon,
  children,
  actions,
}: {
  icon: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex min-h-8 items-center justify-between gap-2">
    <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-current">
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="truncate">{children}</span>
    </div>
    {actions && (
      <div className="flex shrink-0 items-center gap-1">
        {actions}
      </div>
    )}
  </div>
);

export const MeterBar = ({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-current/10">
    <div
      className={cn("h-full rounded-full bg-primary shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_45%,transparent)]", className)}
      style={{ width: `${percent}%` }}
    />
  </div>
);

export const EmptyPanelCard = ({
  children,
}: {
  children: ReactNode;
}) => (
  <div className="rounded-lg border border-current/10 bg-background/35 px-3 py-4 text-center text-xs leading-5 text-current opacity-70 shadow-sm">
    {children}
  </div>
);
