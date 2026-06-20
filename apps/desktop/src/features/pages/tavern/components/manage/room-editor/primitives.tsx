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

export const EditorSection = ({
  icon: Icon,
  title,
  description,
  meta,
  action,
  children,
  className,
  contentClassName,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section
    className={cn(
      "border-b border-border/70 last:border-b-0",
      className,
    )}
  >
    <div className="flex items-start justify-between gap-3 px-1 py-4">
      <div className="flex min-w-0 gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-5">{title}</h3>
            {meta && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
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
    <div className={cn("space-y-3 px-1 pb-5", contentClassName)}>
      {children}
    </div>
  </section>
);
