import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "design-system/components/ui/button";

type SettingsPageHeaderProps = {
  title: string;
  description: string;
  action: ReactNode;
};

export const SettingsPageHeader = ({ title, description, action }: SettingsPageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="app-page-header flex min-h-28 shrink-0 items-center justify-between gap-4 bg-transparent px-6 py-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="-ml-2 rounded-full bg-muted/55 text-muted-foreground hover:bg-accent/75 hover:text-foreground"
          title="返回设置"
          aria-label="返回应用设置"
          onClick={() => navigate("/settings")}
        >
          <ChevronLeft className="size-5" />
        </Button>

        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="shrink-0">{action}</div>
    </header>
  );
};
