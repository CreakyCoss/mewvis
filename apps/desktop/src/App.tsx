import { useEffect, useState } from "react";
import { Folder, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowDragRegion } from "@/components/window-drag-region";
import { ConfigDatabaseDialog } from "@/features/app-recovery/components/config-database-dialog";
import { StartupGate } from "@/features/app-startup/components/startup-gate";
import { WorkspaceChatPage } from "@/features/workspace-chat/components/page";
import { CreateDialog } from "@/features/workspaces/components/create-dialog";
import { useOverview } from "@/features/workspaces/hooks/use-overview";
import type { Workspace } from "@/features/workspaces/types";
import "./App.css";

const WorkspaceApp = () => {
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
    openEditWorkspace,
    loadOverview,
    saveWorkspace,
  } = useOverview();
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(() => {
    const stored = sessionStorage.getItem("novel-claw:active-workspace");
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as Workspace;
    } catch {
      sessionStorage.removeItem("novel-claw:active-workspace");
      return null;
    }
  });

  useEffect(() => {
    if (!overview) {
      return;
    }

    if (activeWorkspace) {
      const latest = overview.workspaces.find((workspace) => workspace.id === activeWorkspace.id);
      if (latest && latest.updatedAt !== activeWorkspace.updatedAt) {
        setActiveWorkspace(latest);
      }
      if (!latest && overview.workspaces.length > 0) {
        setActiveWorkspace(overview.workspaces[0]);
      }
      return;
    }

    if (overview.workspaces.length > 0) {
      setActiveWorkspace(overview.workspaces[0]);
    }
  }, [activeWorkspace, overview]);

  useEffect(() => {
    if (activeWorkspace) {
      sessionStorage.setItem(
        "novel-claw:active-workspace",
        JSON.stringify(activeWorkspace),
      );
      return;
    }

    sessionStorage.removeItem("novel-claw:active-workspace");
  }, [activeWorkspace]);

  const handleSaveWorkspace = async () => {
    const saved = await saveWorkspace();
    if (saved) {
      setActiveWorkspace(saved);
    }
  };

  const workspaceDialog = (
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
      onSubmit={handleSaveWorkspace}
    />
  );

  if (activeWorkspace) {
    return (
      <>
        <WorkspaceChatPage
          workspace={activeWorkspace}
          onOpenWorkspace={setActiveWorkspace}
          onCreateWorkspace={openCreateWorkspace}
          onEditWorkspace={openEditWorkspace}
        />
        {workspaceDialog}
        <ConfigDatabaseDialog onRecovered={loadOverview} />
      </>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-12 bg-background/85 shadow-[0_10px_30px_-30px_rgb(15_23_42_/_0.35)] backdrop-blur" />
      <WindowDragRegion className="fixed inset-x-0 top-0 z-[31] h-12" />
      <main className="flex h-screen min-h-screen overflow-hidden bg-background pt-12 text-foreground">
        <aside className="hidden w-[288px] shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-[10px_0_32px_-28px_rgb(15_23_42_/_0.45)] md:flex">
          <div className="px-4 py-4">
            <h1 className="truncate text-sm font-semibold">Mewvis</h1>
          </div>
          <div className="space-y-1 px-3 pb-3">
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-full justify-start px-2"
              onClick={openCreateWorkspace}
            >
              <Plus className="size-4" />
              <span>新增工作区</span>
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-3">
              <div className="px-2 text-xs font-medium text-muted-foreground">
                项目
              </div>
              {isLoading ? (
                <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span>正在读取工作区</span>
                </div>
              ) : sections.length ? (
                sections.map(({ group, workspaces }) => (
                  <div key={group.id} className="space-y-1">
                    <div className="px-2 text-[11px] font-medium text-muted-foreground">
                      {group.name}
                    </div>
                    {workspaces.map((workspace) => (
                      <button
                        key={workspace.id}
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                        onClick={() => setActiveWorkspace(workspace)}
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {workspace.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                <div className="px-2 py-6 text-sm text-muted-foreground">
                  暂无工作区
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="max-w-lg space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
              <Folder className="size-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">选择或创建一个工作区</h2>
              <p className="text-sm text-muted-foreground">
                之后所有项目切换、会话历史和工作都会留在这个单一工作台页面中。
              </p>
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="button" onClick={openCreateWorkspace}>
              <Plus className="size-4" />
              <span>新增工作区</span>
            </Button>
          </div>
        </section>

        {workspaceDialog}
      </main>
      <ConfigDatabaseDialog onRecovered={loadOverview} />
    </>
  );
};

const App = () => {
  return (
    <StartupGate>
      <WorkspaceApp />
    </StartupGate>
  );
};

export default App;
