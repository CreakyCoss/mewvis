import { Folder, Sparkles } from "lucide-react";
import type { Workspace } from "../types";

type CardProps = {
  workspace: Workspace;
  onOpen: (workspace: Workspace) => void;
};

export const Card = ({ workspace, onOpen }: CardProps) => {
  return (
    <button
      type="button"
      className="group rounded-md border border-border/80 bg-card p-4 text-left text-card-foreground shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={() => onOpen(workspace)}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Folder className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold">{workspace.name}</h3>
            {workspace.isPinned && (
              <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" />
                置顶
              </span>
            )}
          </div>
          {workspace.description && (
            <p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
              {workspace.description}
            </p>
          )}
          <p className="truncate rounded-sm bg-muted/70 px-2 py-1 font-mono text-xs text-muted-foreground">
            {workspace.path}
          </p>
        </div>
      </div>
    </button>
  );
};
