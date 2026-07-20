import { useMemo, useState } from "react";
import { FolderIcon, FolderPlusIcon, FolderXIcon, SearchIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspaceStore, type Workspace } from "../home/workspace-store";

type WorkspacePickerProps = {
  onCreateWorkspace: () => void;
};

export const WorkspacePicker = ({ onCreateWorkspace }: WorkspacePickerProps) => {
  const workspaceStore = useWorkspaceStore();
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

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

  const chooseWorkspace = (workspace: Workspace | null) => {
    workspaceStore.setCurrentWorkspace(workspace);
    setIsOpen(false);
    setWorkspaceSearch("");
  };

  const workspaceLabel =
    workspaceStore.currentWorkspace && !workspaceStore.currentWorkspace.isDefault
      ? workspaceStore.currentWorkspace.name
      : "不使用工作区";

  return (
    <div className="mx-auto flex w-full max-w-[69rem] flex-wrap items-start gap-3 px-1">
      <Combobox
        value={
          workspaceStore.currentWorkspace && !workspaceStore.currentWorkspace.isDefault
            ? workspaceStore.currentWorkspace.id
            : ""
        }
        inputValue={workspaceSearch}
        open={isOpen}
        disabled={workspaceStore.isLoading}
        filter={null}
        itemToStringLabel={(workspaceId) => {
          if (!workspaceId) {
            return "不使用工作区";
          }

          return workspaceStore.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "";
        }}
        onInputValueChange={setWorkspaceSearch}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setWorkspaceSearch("");
          }
        }}
        onValueChange={(workspaceId) => {
          chooseWorkspace(
            workspaceId
              ? (workspaceStore.workspaces.find((workspace) => workspace.id === workspaceId) ?? null)
              : (workspaceStore.workspaces.find((workspace) => workspace.isDefault) ?? null),
          );
        }}
      >
        <ComboboxTrigger
          render={<Button type="button" variant="ghost" size="lg" />}
          title={workspaceStore.currentWorkspace?.path || workspaceLabel}
          className="group/workspace-trigger h-11 max-w-72 cursor-pointer gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground data-popup-open:[&>svg:last-child]:rotate-180 [&>svg:last-child]:size-3.5 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200"
        >
          {workspaceStore.isLoading ? (
            <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
          ) : (
            <FolderIcon className="size-4" aria-hidden="true" />
          )}
          <span className="min-w-0 truncate">{workspaceStore.isLoading ? "正在加载工作区" : workspaceLabel}</span>
        </ComboboxTrigger>

        <ComboboxContent
          align="start"
          sideOffset={8}
          aria-label="选择工作区"
          className="w-[min(22rem,calc(100vw-2rem))] min-w-0 rounded-2xl border border-border/80 p-2 shadow-xl"
        >
          <label htmlFor="chat-home-workspace-search" className="sr-only">
            搜索工作区
          </label>
          <ComboboxInput
            id="chat-home-workspace-search"
            autoFocus
            showTrigger={false}
            placeholder="搜索工作区"
            className="mb-2 h-11 w-full rounded-lg border-transparent bg-muted/45 shadow-none focus-within:border-ring/40 focus-within:ring-2 focus-within:ring-ring/20"
          >
            <InputGroupAddon align="inline-start">
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
          </ComboboxInput>

          <ComboboxList className="max-h-64 space-y-1 p-0">
            {visibleWorkspaces.map((workspace, index) => (
              <ComboboxItem
                key={workspace.id}
                value={workspace.id}
                index={index}
                title={workspace.path}
                className="min-h-11 cursor-pointer gap-3 rounded-lg px-2.5 py-2 pr-8"
              >
                <FolderIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{workspace.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{workspace.path}</span>
                </span>
              </ComboboxItem>
            ))}

            {visibleWorkspaces.length === 0 && (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                {normalizedSearch ? "没有匹配的工作区" : "还没有可选择的工作区"}
              </p>
            )}

            <ComboboxSeparator className="mx-0 my-2" />
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full cursor-pointer justify-start gap-3 rounded-lg px-2.5 py-2 font-medium"
              onClick={() => {
                setIsOpen(false);
                setWorkspaceSearch("");
                onCreateWorkspace();
              }}
            >
              <FolderPlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">新建工作区</span>
            </Button>
            <ComboboxItem
              value=""
              index={visibleWorkspaces.length}
              className="min-h-11 cursor-pointer gap-3 rounded-lg px-2.5 py-2 pr-8 font-medium"
            >
              <FolderXIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">不使用工作区</span>
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

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
