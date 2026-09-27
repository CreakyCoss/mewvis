import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";
import { Button } from "design-system/components/ui/button";
import { cn } from "design-system/lib/utils";

type PageHeaderProps = {
  title: string;
  description: string;
  backLink?: { to: string; label: string };
  action?: ReactNode;
  className?: string;
};

export const PageHeader = ({ title, description, backLink, action, className }: PageHeaderProps) => (
  <header
    className={cn(
      "app-page-header flex min-h-28 shrink-0 items-center justify-between gap-4 bg-transparent px-6 py-5 lg:px-8",
      className,
    )}
  >
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {backLink && (
        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          className="-ml-2 rounded-full bg-muted/55 text-muted-foreground hover:bg-accent/75 hover:text-foreground"
        >
          <Link to={backLink.to} title={backLink.label} aria-label={backLink.label}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
        </Button>
      )}
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
      </div>
    </div>

    {action != null && <div className="shrink-0">{action}</div>}
  </header>
);
