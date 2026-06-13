import { useState } from "react";
import { Bot, Database, Folder, GitBranch, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CollaborationWorkflowSettingsDialog } from "@/features/ai/workflow/components/dialog";
import { AgentSettingsDialog } from "@/features/ai/agent/components/dialog";
import { LlmSettingsPage } from "@/features/ai/llm";
import { APP_DISPLAY_NAME } from "@/product-config";
import { CreateDialog } from "./create-dialog";
import { Content } from "./content";
import { useOverview } from "../hooks/use-overview";
import type { Workspace } from "../types";

type WorkspacesPageProps = {
  onOpenWorkspace: (workspace: Workspace) => void;
};

export const WorkspacesPage = ({ onOpenWorkspace }: WorkspacesPageProps) => {
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const [isCollaborationWorkflowSettingsOpen, setIsCollaborationWorkflowSettingsOpen] = useState(false);
  const [isLlmSettingsPageOpen, setIsLlmSettingsPageOpen] = useState(false);
  const {
    overview,
    form,
    editingWorkspace,
    sections,
    isDialogOpen,
    isLoading,
    isSaving,
    error,
    setForm,
    handleDialogOpenChange,
    openCreateWorkspace,
    saveWorkspace,
  } = useOverview();

  return (
    <main className="flex h-screen min-h-screen overflow-hidden bg-muted/35 text-foreground">
      <aside className="hidden w-[272px] shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-[10px_0_32px_-28px_rgb(15_23_42_/_0.45)] md:flex">
        <div className="px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
              <Folder className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">{APP_DISPLAY_NAME}</h1>
              <p className="text-xs text-muted-foreground">工作区控制台</p>
            </div>
          </div>
        </div>

        <div className="px-3 pb-3">
          <Button
            type="button"
            className="w-full justify-start"
            onClick={openCreateWorkspace}
          >
            <Plus className="size-4" />
            <span>新增工作区</span>
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 p-3">
            <section className="space-y-2">
              <div className="flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
                <span>工作区 / 项目</span>
                <span>{overview?.workspaces.length ?? 0}</span>
              </div>
              <div className="space-y-3">
                {isLoading ? (
                  <div className="rounded-md px-2 py-6 text-center text-sm text-muted-foreground">
                    正在读取工作区
                  </div>
                ) : sections.length ? (
                  sections.map(({ group, workspaces }) => (
                    <div key={group.id} className="space-y-1">
                      <div className="px-2 text-[11px] font-medium text-muted-foreground">
                        {group.name}
                      </div>
                      {workspaces.length ? (
                        workspaces.map((workspace) => (
                          <button
                            key={workspace.id}
                            type="button"
                            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                            onClick={() => onOpenWorkspace(workspace)}
                          >
                            <Folder className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {workspace.name}
                              </span>
                              <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                                {workspace.path}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          当前分组暂无项目
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md px-2 py-6 text-center text-sm text-muted-foreground">
                    暂无项目
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="px-2 text-xs font-medium text-muted-foreground">
                配置
              </div>
              <div className="rounded-md bg-sidebar-accent/45 p-2 shadow-xs">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Database className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="font-medium text-sidebar-foreground">
                      配置数据库
                    </div>
                    <div className="truncate font-mono">
                      {overview?.configDbPath ?? "正在初始化"}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="space-y-1 bg-sidebar/95 p-3">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setIsAgentSettingsOpen(true)}
          >
            <Bot className="size-4" />
            <span>角色设置</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setIsCollaborationWorkflowSettingsOpen(true)}
          >
            <GitBranch className="size-4" />
            <span>协作流程设置</span>
          </Button>
          <Button
            type="button"
            variant={isLlmSettingsPageOpen ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setIsLlmSettingsPageOpen(true)}
          >
            <Settings className="size-4" />
            <span>LLM 设置</span>
          </Button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {isLlmSettingsPageOpen ? (
          <LlmSettingsPage onBack={() => setIsLlmSettingsPageOpen(false)} />
        ) : (
          <>
            <header className="flex min-h-14 items-center justify-between gap-3 bg-card/80 px-4 py-3 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)] backdrop-blur md:px-5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">工作区</h2>
                <p className="truncate text-xs text-muted-foreground">
                  组织项目、配置模型，并进入工作区继续创作与编辑。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="角色设置"
                  className="md:hidden"
                  onClick={() => setIsAgentSettingsOpen(true)}
                >
                  <Bot className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="协作流程设置"
                  className="md:hidden"
                  onClick={() => setIsCollaborationWorkflowSettingsOpen(true)}
                >
                  <GitBranch className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="LLM 设置"
                  className="md:hidden"
                  onClick={() => setIsLlmSettingsPageOpen(true)}
                >
                  <Settings className="size-4" />
                </Button>
                <Button type="button" onClick={openCreateWorkspace}>
                  <Plus className="size-4" />
                  <span>新增工作区</span>
                </Button>
              </div>
            </header>

            {error && (
              <div className="mx-4 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:mx-5">
                {error}
              </div>
            )}

            <ScrollArea className="min-h-0 flex-1">
              <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
                <Content
                  overview={overview}
                  sections={sections}
                  isLoading={isLoading}
                  onCreateWorkspace={openCreateWorkspace}
                  onOpenWorkspace={onOpenWorkspace}
                />
              </section>
            </ScrollArea>
          </>
        )}
      </section>

      <CreateDialog
        open={isDialogOpen}
        mode={editingWorkspace ? "edit" : "create"}
        form={form}
        groups={overview?.groups ?? []}
        sections={sections}
        isSaving={isSaving}
        error={error}
        onOpenChange={handleDialogOpenChange}
        onFormChange={setForm}
        onSubmit={saveWorkspace}
      />

      <AgentSettingsDialog
        open={isAgentSettingsOpen}
        onOpenChange={setIsAgentSettingsOpen}
      />

      <CollaborationWorkflowSettingsDialog
        open={isCollaborationWorkflowSettingsOpen}
        onOpenChange={setIsCollaborationWorkflowSettingsOpen}
      />
    </main>
  );
};
