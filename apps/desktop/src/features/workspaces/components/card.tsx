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
      className="rounded-md border border-border bg-card p-4 text-left text-card-foreground shadow-xs transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={() => onOpen(workspace)}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Folder className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-medium">{workspace.name}</h3>
            {workspace.isPinned && (
              <Sparkles className="size-4 shrink-0 text-primary" />
            )}
          </div>
          {workspace.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {workspace.description}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {workspace.path}
          </p>
        </div>
      </div>
    </button>
  );
};
