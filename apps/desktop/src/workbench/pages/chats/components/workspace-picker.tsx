import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, FolderIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import type { Workspace } from "@/api/workspace";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspaceStore } from "../workspace-store";

type WorkspacePickerProps = {
  onCreateWorkspace: () => void;
};

export const WorkspacePicker = ({ onCreateWorkspace }: WorkspacePickerProps) => {
  const workspaceStore = useWorkspaceStore();
  const [workspaceSearch, setWorkspaceSearch] = useState("");

  const defaultWorkspace = workspaceStore.workspaces.find((workspace) => workspace.isDefault) ?? null;
  const normalizedSearch = workspaceSearch.trim().toLocaleLowerCase("zh-CN");
  const visibleWorkspaces = useMemo(
    () =>
      workspaceStore.workspaces.filter(
        (workspace) =>
          !workspace.isDefault &&
          (!normalizedSearch ||
            workspace.name.toLocaleLowerCase("zh-CN").includes(normalizedSearch) ||
            workspace.path.toLocaleLowerCase("zh-CN").includes(normalizedSearch)),
      ),
    [normalizedSearch, workspaceStore.workspaces],
  );

  const isDefaultWorkspaceSelected = !workspaceStore.currentWorkspace || workspaceStore.currentWorkspace.isDefault;
  const workspaceLabel =
    isDefaultWorkspaceSelected || !workspaceStore.currentWorkspace
      ? "不使用工作区"
      : workspaceStore.currentWorkspace.name;

  const chooseWorkspace = (workspace: Workspace | null) => {
    if (workspace?.id !== workspaceStore.currentWorkspace?.id) {
      workspaceStore.setCurrentWorkspace(workspace);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[69rem] flex-wrap items-start gap-3">
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
            disabled={workspaceStore.isLoading}
            className="h-9 max-w-full cursor-pointer rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            title={workspaceStore.currentWorkspace?.path || workspaceLabel}
          >
            {workspaceStore.isLoading ? (
              <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
            ) : isDefaultWorkspaceSelected ? (
              <span className="relative flex size-4 shrink-0 items-center justify-center">
                <FolderIcon className="size-4" aria-hidden="true" />
                <XIcon className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" aria-hidden="true" />
              </span>
            ) : (
              <FolderIcon className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">{workspaceStore.isLoading ? "正在加载工作区" : workspaceLabel}</span>
            <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          aria-label="选择工作区"
          className="w-80 rounded-2xl border-border/70 bg-popover p-2 shadow-xl"
        >
          <div className="relative mb-2">
            <label htmlFor="chat-home-workspace-search" className="sr-only">
              搜索工作区
            </label>
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/80"
              aria-hidden="true"
            />
            <input
              id="chat-home-workspace-search"
              type="search"
              value={workspaceSearch}
              placeholder="搜索工作区"
              className="h-9 w-full rounded-lg border-0 bg-transparent pr-2 pl-8 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:bg-muted/45 focus:ring-0 focus:outline-none"
              onChange={(event) => setWorkspaceSearch(event.currentTarget.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {visibleWorkspaces.length > 0 ? (
              visibleWorkspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  className="h-10 cursor-pointer gap-3 rounded-lg px-2.5 text-sm font-medium"
                  title={workspace.path}
                  onSelect={() => chooseWorkspace(workspace)}
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {workspace.id === workspaceStore.currentWorkspace?.id && (
                    <CheckIcon className="size-4 shrink-0 text-foreground" aria-hidden="true" />
                  )}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2.5 py-4 text-sm text-muted-foreground">
                {normalizedSearch ? "没有匹配的工作区" : "还没有可选择的工作区"}
              </div>
            )}
          </div>

          <DropdownMenuSeparator className="mx-2 my-2" />

          <DropdownMenuItem
            className="h-10 cursor-pointer gap-3 rounded-lg px-2.5 text-sm font-semibold"
            onSelect={onCreateWorkspace}
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <FolderIcon className="size-4" aria-hidden="true" />
              <PlusIcon className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate">新建工作区</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="h-10 cursor-pointer gap-3 rounded-lg px-2.5 text-sm font-semibold"
            title={defaultWorkspace?.path}
            onSelect={() => chooseWorkspace(defaultWorkspace)}
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <FolderIcon className="size-4" aria-hidden="true" />
              <XIcon className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate">不使用工作区</span>
            {isDefaultWorkspaceSelected && <CheckIcon className="size-4 shrink-0 text-foreground" aria-hidden="true" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {workspaceStore.error && (
        <Alert
          variant="destructive"
          className="min-h-11 w-auto max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-0 bg-transparent px-0 py-0 has-data-[slot=alert-action]:pr-0"
        >
          <AlertDescription className="min-w-0 truncate">{workspaceStore.error}</AlertDescription>
          <AlertAction className="static">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer text-foreground"
              onClick={() => void workspaceStore.loadWorkspaces()}
            >
              重试
            </Button>
          </AlertAction>
        </Alert>
      )}
    </div>
  );
};
