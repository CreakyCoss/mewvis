import type { ComponentType, ReactNode } from "react";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
    {description && <span className="block text-xs leading-5 text-muted-foreground">{description}</span>}
  </label>
);

type EditorMetricItem = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  description?: ReactNode;
  className?: string;
};

export const EditorMetricStrip = ({ items }: { items: EditorMetricItem[] }) => (
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
          <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-sm font-medium leading-5 text-foreground">{value}</div>
          {description && <div className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">{description}</div>}
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
      tone === "muted" && "bg-muted text-muted-foreground ring-border/55 dark:bg-muted/55",
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

export const editorHeaderActionButtonClassName =
  "h-8 gap-1.5 rounded-md border-primary/15 bg-primary/[0.06] px-2.5 text-xs font-medium text-primary shadow-none hover:border-primary/25 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/20 dark:border-primary/20 dark:bg-primary/12 dark:hover:bg-primary/18";

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
}) => {
  const hasDescription = Boolean(description);

  return (
    <section id={id} className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", className)}>
      <div
        className={cn(
          "flex justify-between gap-3 border-b bg-muted/10 px-4 py-3",
          hasDescription ? "items-start" : "items-center",
        )}
      >
        <div className={cn("flex min-w-0 gap-2.5", hasDescription ? "items-start" : "items-center")}>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary",
              hasDescription && "mt-0.5",
            )}
          >
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
            {description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("space-y-3 px-4 py-4", contentClassName)}>{children}</div>
    </section>
  );
};

export const EditorFormDialogContent = ({ children, className }: { children: ReactNode; className?: string }) => (
  <DialogContent
    className={cn(
      "!flex h-[min(820px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl",
      className,
    )}
  >
    {children}
  </DialogContent>
);

export const EditorFormHeader = ({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description: ReactNode;
}) => (
  <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <DialogTitle className="text-xl leading-7">{title}</DialogTitle>
        <DialogDescription className="mt-0.5 text-sm leading-6">{description}</DialogDescription>
      </div>
    </div>
  </DialogHeader>
);

export const EditorFormLayout = ({
  sidebar,
  children,
  className,
}: {
  sidebar?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "grid min-h-0 flex-1 overflow-hidden bg-muted/10",
      sidebar && "md:grid-cols-[260px_minmax(0,1fr)]",
      className,
    )}
  >
    {sidebar && (
      <aside className="hidden min-h-0 border-r bg-background/88 p-4 md:block">
        <div className="flex h-full min-h-0 flex-col gap-3">{sidebar}</div>
      </aside>
    )}
    <div className="min-h-0 overflow-y-auto overscroll-contain">
      <div className="space-y-3 px-4 py-4 sm:px-5">{children}</div>
    </div>
  </div>
);

export const EditorFormFooter = ({
  children,
  status,
  className,
}: {
  children: ReactNode;
  status?: ReactNode;
  className?: string;
}) => (
  <DialogFooter
    className={cn(
      "relative z-10 shrink-0 border-t bg-background/96 px-5 py-4 shadow-[0_-12px_24px_-24px_rgb(15_23_42_/_0.45)] sm:items-center sm:justify-between sm:px-6",
      className,
    )}
  >
    {status ? (
      <>
        <div className="min-w-0 text-xs leading-5 text-muted-foreground">{status}</div>
        <div className="flex shrink-0 justify-end gap-2">{children}</div>
      </>
    ) : (
      children
    )}
  </DialogFooter>
);

export const EditorFormSidebarCard = ({
  icon: Icon,
  title,
  meta,
  image,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  meta?: ReactNode;
  image?: ReactNode;
  children?: ReactNode;
}) => (
  <section className="rounded-xl border border-primary/18 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),hsl(var(--background))_58%)] p-4 shadow-xs">
    <div className="flex items-start gap-3">
      {image ?? (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Icon className="size-5" />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold leading-7">{title}</div>
        {meta && <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] leading-4">{meta}</div>}
      </div>
    </div>
    {children && <div className="mt-4">{children}</div>}
  </section>
);

export const EditorFormSidebarPanel = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <section className="rounded-lg border bg-background/74 p-3 shadow-xs">
    <div className="text-xs font-medium text-muted-foreground">{title}</div>
    <div className="mt-2">{children}</div>
  </section>
);

export const EditorFormNav = ({
  items,
}: {
  items: Array<{
    href: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
  }>;
}) => (
  <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border bg-background/74 p-2 shadow-xs">
    <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">快速定位</div>
    {items.map(({ href, icon: Icon, label }) => (
      <button
        key={href}
        type="button"
        className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/[0.06] hover:text-foreground"
        onClick={() => {
          const targetId = href.startsWith("#") ? href.slice(1) : href;
          document.getElementById(targetId)?.scrollIntoView({
            block: "start",
            behavior: "smooth",
          });
        }}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:bg-background/70 group-hover:text-primary">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 truncate font-medium">{label}</span>
      </button>
    ))}
  </nav>
);

export const EditorFormCard = ({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) => {
  const hasDescription = Boolean(description);

  return (
    <section id={id} className={cn("overflow-hidden rounded-lg border bg-card shadow-xs", className)}>
      <div className={cn("flex justify-between gap-3 px-4 py-3", hasDescription ? "items-start" : "items-center")}>
        <div className={cn("flex min-w-0 gap-2.5", hasDescription ? "items-start" : "items-center")}>
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary",
              hasDescription && "mt-0.5",
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-5">{title}</h3>
            {description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("border-t px-4 py-3", contentClassName)}>{children}</div>
    </section>
  );
};
