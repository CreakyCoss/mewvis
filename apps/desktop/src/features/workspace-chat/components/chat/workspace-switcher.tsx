import { useState } from "react";
import { Check, ChevronDown, Folder, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isDefaultWorkspace } from "@/features/workspaces/default-workspace";
import type { Workspace } from "@/features/workspaces/types";

type WorkspaceSwitcherProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
};

export const WorkspaceSwitcher = ({
  workspace,
  workspaces,
  onOpenWorkspace,
  onCreateWorkspace,
}: WorkspaceSwitcherProps) => {
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const defaultWorkspace = workspaces.find(isDefaultWorkspace) ?? null;
  const projectWorkspaces = workspaces.filter((item) => !isDefaultWorkspace(item));
  const isDefaultWorkspaceSelected = isDefaultWorkspace(workspace);
  const workspaceSwitcherLabel = isDefaultWorkspaceSelected ? "不使用项目" : workspace.name;
  const normalizedWorkspaceSearch = workspaceSearch.trim().toLowerCase();
  const visibleProjectWorkspaces = normalizedWorkspaceSearch
    ? projectWorkspaces.filter((item) =>
      item.name.toLowerCase().includes(normalizedWorkspaceSearch) ||
      item.path.toLowerCase().includes(normalizedWorkspaceSearch)
    )
    : projectWorkspaces;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setWorkspaceSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 max-w-full rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          title={workspace.path}
        >
          {isDefaultWorkspaceSelected ? (
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <Folder className="size-4" />
              <X className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
            </span>
          ) : (
            <Folder className="size-4 shrink-0" />
          )}
          <span className="min-w-0 truncate">{workspaceSwitcherLabel}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 rounded-2xl border-border/70 bg-popover p-2 shadow-xl"
      >
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/80" />
          <input
            type="search"
            value={workspaceSearch}
            onChange={(event) => setWorkspaceSearch(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="搜索项目"
            className="h-9 w-full rounded-lg border-0 bg-transparent pr-2 pl-8 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:bg-muted/45 focus:ring-0 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          {visibleProjectWorkspaces.length > 0 ? visibleProjectWorkspaces.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="h-10 gap-3 rounded-lg px-2.5 text-sm font-medium"
              title={item.path}
              onSelect={() => {
                if (item.id !== workspace.id) {
                  onOpenWorkspace(item);
                }
              }}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.id === workspace.id && (
                <Check className="size-4 shrink-0 text-foreground" />
              )}
            </DropdownMenuItem>
          )) : (
            <div className="px-2.5 py-4 text-sm text-muted-foreground">
              没有匹配的项目
            </div>
          )}
        </div>
        <DropdownMenuSeparator className="mx-2 my-2" />
        <DropdownMenuItem
          className="h-10 gap-3 rounded-lg px-2.5 text-sm font-semibold"
          onSelect={onCreateWorkspace}
        >
          <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <Folder className="size-4" />
            <Plus className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
          </span>
          <span className="min-w-0 flex-1 truncate">新建工作区</span>
        </DropdownMenuItem>
        {defaultWorkspace && (
          <DropdownMenuItem
            className="h-10 gap-3 rounded-lg px-2.5 text-sm font-semibold"
            title={defaultWorkspace.path}
            onSelect={() => {
              if (defaultWorkspace.id !== workspace.id) {
                onOpenWorkspace(defaultWorkspace);
              }
            }}
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <Folder className="size-4" />
              <X className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
            </span>
            <span className="min-w-0 flex-1 truncate">不使用项目</span>
            {defaultWorkspace.id === workspace.id && (
              <Check className="size-4 shrink-0 text-foreground" />
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
