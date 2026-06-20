import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { emptyValueText } from "./utils";

export const EditorField = ({
  label,
  htmlFor,
  children,
  description,
  action,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <label className={cn("block space-y-1.5", className)} htmlFor={htmlFor}>
    <span className="flex min-h-5 items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {action && <span className="shrink-0">{action}</span>}
    </span>
    {children}
    {description && (
      <span className="block text-xs leading-5 text-muted-foreground">
        {description}
      </span>
    )}
  </label>
);

export const CompactSummaryItem = ({
  label,
  value,
  description,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  className?: string;
  valueClassName?: string;
}) => (
  <div className={cn("min-w-0 rounded-md bg-background/45 px-2.5 py-2", className)}>
    <div className="truncate text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
    <div className={cn("mt-0.5 min-w-0 truncate text-sm font-medium leading-5", valueClassName)}>
      {value}
    </div>
    {description && (
      <div className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
        {description}
      </div>
    )}
  </div>
);

type EditorMetricItem = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  description?: ReactNode;
  className?: string;
};

export const EditorMetricStrip = ({
  items,
}: {
  items: EditorMetricItem[];
}) => (
  <div className="grid overflow-hidden rounded-lg border border-border/70 bg-background/72 shadow-xs sm:grid-cols-2 xl:grid-cols-4">
    {items.map(({ icon: Icon, label, value, description, className }, index) => (
      <div
        key={label}
        className={cn(
          "flex min-w-0 items-center gap-2.5 border-border/60 px-3 py-3",
          index > 0 && "border-t sm:border-t-0 sm:border-l",
          index === 2 && "sm:border-l-0 xl:border-l",
          className,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary ring-1 ring-primary/10">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-muted-foreground">
            {label}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium leading-5 text-foreground">
            {value}
          </div>
          {description && (
            <div className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
);

export const EditorStatusPill = ({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "active" | "muted" | "info" | "warning";
}) => (
  <span
    className={cn(
      "inline-flex h-5 min-w-10 items-center justify-center rounded-full px-2 text-[11px] font-medium leading-4 ring-1",
      tone === "active" &&
        "bg-teal-500/10 text-teal-700 ring-teal-500/12 dark:bg-teal-400/14 dark:text-teal-200 dark:ring-teal-300/16",
      tone === "muted" &&
        "bg-muted text-muted-foreground ring-border/55 dark:bg-muted/55",
      tone === "info" &&
        "bg-sky-500/10 text-sky-700 ring-sky-500/14 dark:bg-sky-400/14 dark:text-sky-200 dark:ring-sky-300/16",
      tone === "warning" &&
        "bg-amber-500/12 text-amber-700 ring-amber-500/16 dark:bg-amber-400/14 dark:text-amber-200 dark:ring-amber-300/18",
    )}
  >
    {children}
  </span>
);

export const EditorSettingGroup = ({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("min-w-0 space-y-3", className)}>
    <h4 className="flex items-center gap-2 text-sm font-semibold leading-5 text-foreground">
      <span className="h-4 w-1 rounded-full bg-primary" />
      {title}
    </h4>
    <div className="space-y-2">{children}</div>
  </section>
);

export const EditorSettingRow = ({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) => (
  <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2">
    <Icon className="size-3.5 text-muted-foreground" />
    <span className="min-w-0 truncate text-xs font-medium leading-5 text-foreground/72">
      {label}
    </span>
    <span className="shrink-0">{children}</span>
  </div>
);

export const EditorProgressCard = ({
  title,
  value,
  progress,
  description,
}: {
  title: string;
  value: ReactNode;
  progress: number;
  description?: ReactNode;
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <aside className="flex min-h-full rounded-lg border border-border/70 bg-background/72 p-2.5 shadow-xs">
      <div className="flex min-h-32 w-full flex-col justify-between rounded-md bg-primary/5 px-3.5 py-3.5 ring-1 ring-primary/8">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description && (
            <div className="text-xs leading-5 text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="text-xl font-semibold leading-7 tracking-normal text-foreground">
            {value}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};

export const InlineSummaryItem = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => {
  const normalizedValue = value.trim();
  const displayValue = normalizedValue || emptyValueText;

  return (
    <div className={cn("flex min-w-0 items-baseline gap-2", className)}>
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-sm leading-5 text-foreground",
          !normalizedValue && "text-muted-foreground",
        )}
        title={displayValue}
      >
        {displayValue}
      </span>
    </div>
  );
};

export const SceneSummaryLine = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => {
  const normalizedValue = value.trim();

  return (
    <div className={cn("flex min-w-0 items-start gap-1.5 text-xs leading-5", className)}>
      <span className="shrink-0 font-medium text-foreground/70">{label}：</span>
      <span
        className={cn(
          "min-w-0 flex-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground",
          !normalizedValue && "text-muted-foreground/70",
        )}
        title={normalizedValue || emptyValueText}
      >
        {normalizedValue || emptyValueText}
      </span>
    </div>
  );
};

export const editorHeaderActionButtonClassName =
  "h-8 gap-1.5 rounded-md border-primary/15 bg-primary/[0.06] px-2.5 text-xs font-medium text-primary shadow-none hover:border-primary/25 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/20 dark:border-primary/20 dark:bg-primary/12 dark:hover:bg-primary/18";

export const editorQuietActionButtonClassName =
  "h-7 gap-1 rounded-md border-border/60 bg-background/55 px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:border-primary/20 hover:bg-primary/[0.06] hover:text-primary focus-visible:ring-primary/20 disabled:bg-transparent disabled:text-muted-foreground/45";

export const editorPrimaryActionButtonClassName =
  "h-7 gap-1 rounded-md border-primary/20 bg-primary/[0.08] px-2 text-[11px] font-medium text-primary shadow-none hover:border-primary/30 hover:bg-primary/12 hover:text-primary focus-visible:ring-primary/20 disabled:border-primary/15 disabled:bg-primary/[0.06] disabled:text-primary/70 disabled:opacity-100";

export const editorDangerActionButtonClassName =
  "h-7 gap-1 rounded-md border-transparent bg-transparent px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:border-destructive/15 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20";

export const editorIconActionButtonClassName =
  "size-7 rounded-md border border-transparent bg-transparent text-muted-foreground shadow-none hover:border-primary/15 hover:bg-primary/[0.07] hover:text-primary focus-visible:ring-primary/20";

export const editorDangerIconActionButtonClassName =
  "size-7 rounded-md border border-transparent bg-transparent text-muted-foreground shadow-none hover:border-destructive/15 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20";

export const editorListEntryTitleClassName =
  "min-w-0 truncate text-[13px] font-semibold leading-5 text-foreground/90";

export const editorListEntryBodyClassName =
  "whitespace-pre-wrap text-[13px] leading-5 text-muted-foreground";

export const editorListBadgeClassName =
  "h-[18px] px-1.5 text-[11px] font-medium leading-4";

export const editorListKeywordClassName =
  "rounded-full bg-muted/70 px-2 py-0.5 text-[11px] leading-4 text-muted-foreground";

export const EditorSection = ({
  id,
  icon: Icon,
  title,
  description,
  meta,
  metaClassName,
  action,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  meta?: string;
  metaClassName?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section
    id={id}
    className={cn(
      "overflow-hidden rounded-lg border bg-card shadow-sm",
      className,
    )}
  >
    <div className="flex items-start justify-between gap-3 border-b bg-muted/10 px-4 py-3">
      <div className="flex min-w-0 gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-5">{title}</h3>
            {meta && (
              <span
                className={cn(
                  "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
                  metaClassName,
                )}
              >
                {meta}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className={cn("space-y-3 px-4 py-4", contentClassName)}>
      {children}
    </div>
  </section>
);
