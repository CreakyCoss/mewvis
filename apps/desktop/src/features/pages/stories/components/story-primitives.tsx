import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export const StoryMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <div className="flex min-w-0 items-center gap-3 rounded-md border bg-background px-3 py-2">
    <Icon className="size-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  </div>
);

export const StorySection = ({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="rounded-lg border bg-background p-4">
    <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const EditorField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="block space-y-2">
    <span className="text-sm font-medium">{label}</span>
    {children}
  </label>
);

export const EmptyBlock = ({ text }: { text: string }) => (
  <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
    {text}
  </div>
);
