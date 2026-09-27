import type { ReactNode } from "react";
import { cn } from "design-system/lib/utils";

type SettingsPageHeaderProps = {
  title: string;
  description: string;
  action: ReactNode;
  className?: string;
};

export const SettingsPageHeader = ({ title, description, action, className }: SettingsPageHeaderProps) => (
  <header
    className={cn(
      "app-page-header flex min-h-28 shrink-0 items-center justify-between gap-4 bg-transparent px-6 py-5 lg:px-8",
      className,
    )}
  >
    <div className="min-w-0">
      <h2 className="truncate text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
    </div>

    <div className="shrink-0">{action}</div>
  </header>
);
