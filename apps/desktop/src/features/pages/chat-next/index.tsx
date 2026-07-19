import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FolderIcon, FolderXIcon, SearchIcon, SendIcon } from "lucide-react";
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
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { useChatNextWorkspaceStore, type Workspace } from "./workspace-store";

const NO_WORKSPACE_VALUE = "__chat-next-no-workspace__";

export const ChatNextPage = () => {
  const workspaceStore = useChatNextWorkspaceStore();
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [isWorkspacePickerOpen, setIsWorkspacePickerOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [composerNotice, setComposerNotice] = useState("");

  useEffect(() => {
    void workspaceStore.loadWorkspaces();
  }, [workspaceStore.loadWorkspaces]);

  const defaultWorkspace = workspaceStore.workspaces.find((workspace) => workspace.isDefault) ?? null;
  const selectedWorkspace =
    workspaceStore.workspaces.find((workspace) => workspace.id === workspaceStore.selectedWorkspaceId) ??
    defaultWorkspace;
  const activeWorkspace = selectedWorkspace && !selectedWorkspace.isDefault ? selectedWorkspace : null;
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
    workspaceStore.selectWorkspace(workspace);
    setIsWorkspacePickerOpen(false);
    setWorkspaceSearch("");
    setComposerNotice("");
  };

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    setComposerNotice("主页面和工作区选择已就绪，消息发送将在下一步接入。当前输入内容已为你保留。");
  };

  const workspaceLabel = activeWorkspace?.name ?? "不使用工作区";

  return (
    <main className="relative flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <section
        aria-labelledby="chat-next-title"
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-4 py-8 sm:px-8"
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center py-10">
            <div className="w-full space-y-7">
              <h1
                id="chat-next-title"
                className="mx-auto flex w-full max-w-[42rem] min-w-0 flex-wrap items-baseline justify-center text-center text-2xl font-semibold leading-tight tracking-normal text-foreground sm:text-3xl xl:text-4xl"
                title={activeWorkspace ? `我们应该在 ${activeWorkspace.name} 中构建什么？` : "我们应该构建什么？"}
              >
                {activeWorkspace ? (
                  <>
                    <span className="shrink-0">我们应该在&nbsp;</span>
                    <span className="max-w-full min-w-0 truncate">{activeWorkspace.name}</span>
                    <span className="shrink-0">&nbsp;中构建什么？</span>
                  </>
                ) : (
                  "我们应该构建什么？"
                )}
              </h1>

              <div className="space-y-3">
                <form className="mx-auto w-full max-w-[69rem]" onSubmit={submitPrompt}>
                  <InputGroup className="h-auto flex-col items-stretch overflow-hidden rounded-xl border-0 bg-card shadow-[0_14px_34px_-30px_rgb(15_23_42_/_0.34),0_2px_8px_-7px_rgb(15_23_42_/_0.18),0_1px_2px_rgb(15_23_42_/_0.06)] ring-1 ring-border/50 transition-shadow duration-200 has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/20 dark:bg-card">
                    <label htmlFor="chat-next-prompt" className="sr-only">
                      对话内容
                    </label>
                    <InputGroupTextarea
                      id="chat-next-prompt"
                      value={prompt}
                      rows={3}
                      placeholder={activeWorkspace ? `询问关于 ${activeWorkspace.name} 的任何问题` : "输入问题"}
                      className="max-h-48 min-h-28 w-full px-4 py-4 text-base leading-6 placeholder:text-muted-foreground/70"
                      onChange={(event) => {
                        setPrompt(event.currentTarget.value);
                        setComposerNotice("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />

                    <InputGroupAddon
                      align="block-end"
                      className="min-h-12 justify-between gap-3 px-3 pt-0 pb-3 font-normal"
                    >
                      <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                        <KbdGroup>
                          <Kbd>Ctrl</Kbd>
                          <span>/</span>
                          <Kbd>⌘</Kbd>
                          <Kbd>Enter</Kbd>
                        </KbdGroup>
                        <span>发送</span>
                      </span>
                      <InputGroupButton
                        type="submit"
                        size="icon-sm"
                        variant="outline"
                        disabled={!prompt.trim()}
                        aria-label="发送消息"
                        className="size-10 cursor-pointer rounded-lg shadow-xs"
                      >
                        <SendIcon aria-hidden="true" />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </form>

                <div className="mx-auto flex w-full max-w-[69rem] flex-wrap items-start gap-3 px-1">
                  <Combobox
                    value={activeWorkspace?.id ?? NO_WORKSPACE_VALUE}
                    inputValue={workspaceSearch}
                    open={isWorkspacePickerOpen}
                    disabled={workspaceStore.isLoading}
                    filter={null}
                    itemToStringLabel={(workspaceId) => {
                      if (workspaceId === NO_WORKSPACE_VALUE) {
                        return "不使用工作区";
                      }

                      return workspaceStore.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "";
                    }}
                    onInputValueChange={setWorkspaceSearch}
                    onOpenChange={(open) => {
                      setIsWorkspacePickerOpen(open);
                      if (!open) {
                        setWorkspaceSearch("");
                      }
                    }}
                    onValueChange={(workspaceId) => {
                      if (!workspaceId || workspaceId === NO_WORKSPACE_VALUE) {
                        chooseWorkspace(defaultWorkspace);
                        return;
                      }

                      chooseWorkspace(
                        workspaceStore.workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
                      );
                    }}
                  >
                    <ComboboxTrigger
                      render={<Button type="button" variant="ghost" size="lg" />}
                      title={activeWorkspace?.path || workspaceLabel}
                      className="group/workspace-trigger h-11 max-w-72 cursor-pointer gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground data-popup-open:[&>svg:last-child]:rotate-180 [&>svg:last-child]:size-3.5 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200"
                    >
                      {workspaceStore.isLoading ? (
                        <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
                      ) : (
                        <FolderIcon className="size-4" aria-hidden="true" />
                      )}
                      <span className="min-w-0 truncate">
                        {workspaceStore.isLoading ? "正在加载工作区" : workspaceLabel}
                      </span>
                    </ComboboxTrigger>

                    <ComboboxContent
                      align="start"
                      sideOffset={8}
                      aria-label="选择工作区"
                      className="w-[min(22rem,calc(100vw-2rem))] min-w-0 rounded-2xl border border-border/80 p-2 shadow-xl"
                    >
                      <label htmlFor="chat-next-workspace-search" className="sr-only">
                        搜索工作区
                      </label>
                      <ComboboxInput
                        id="chat-next-workspace-search"
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
                        <ComboboxItem
                          value={NO_WORKSPACE_VALUE}
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

                <p
                  aria-live="polite"
                  className="mx-auto min-h-5 w-full max-w-[69rem] px-1 text-sm text-muted-foreground"
                >
                  {composerNotice}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
