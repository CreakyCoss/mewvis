import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ConfigDatabaseDialog } from "@/features/app-recovery/components/config-database-dialog";
import { StartupGate } from "@/features/app-startup/components/startup-gate";
import { WorkspaceChatPage } from "@/features/workspace-chat/components/page";
import { CreateDialog } from "@/features/workspaces/components/create-dialog";
import { isDefaultWorkspace } from "@/features/workspaces/default-workspace";
import { useOverview } from "@/features/workspaces/hooks/use-overview";
import type { Workspace } from "@/features/workspaces/types";
import { APP_DISPLAY_NAME, appStorageKey } from "@/product-config";
import "./App.css";

const ACTIVE_WORKSPACE_STORAGE_KEY = appStorageKey("active-workspace");

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
    const stored = sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      const workspace = JSON.parse(stored) as Workspace;
      if (typeof workspace.isDefault !== "boolean") {
        sessionStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        return null;
      }

      return workspace;
    } catch {
      sessionStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      return null;
    }
  });

  useEffect(() => {
    if (!overview) {
      return;
    }

    if (activeWorkspace) {
      const latest = overview.workspaces.find((workspace) => workspace.id === activeWorkspace.id);
      if (
        latest &&
        (latest.updatedAt !== activeWorkspace.updatedAt ||
          latest.isDefault !== activeWorkspace.isDefault)
      ) {
        setActiveWorkspace(latest);
      }
      if (!latest && overview.workspaces.length > 0) {
        setActiveWorkspace(
          overview.workspaces.find(isDefaultWorkspace) ?? overview.workspaces[0],
        );
      }
      return;
    }

    if (overview.workspaces.length > 0) {
      const defaultWorkspace =
        overview.workspaces.find(isDefaultWorkspace) ?? overview.workspaces[0];
      setActiveWorkspace(defaultWorkspace);
    }
  }, [activeWorkspace, overview]);

  useEffect(() => {
    if (activeWorkspace) {
      sessionStorage.setItem(
        ACTIVE_WORKSPACE_STORAGE_KEY,
        JSON.stringify(activeWorkspace),
      );
      return;
    }

    sessionStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  }, [activeWorkspace]);

  const handleSaveWorkspace = async () => {
    const saved = await saveWorkspace();
    if (saved) {
      setActiveWorkspace(saved);
    }
  };

  const handleOpenEditWorkspace = (workspace: Workspace) => {
    if (isDefaultWorkspace(workspace)) {
      return;
    }

    openEditWorkspace(workspace);
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
          onEditWorkspace={handleOpenEditWorkspace}
        />
        {workspaceDialog}
        <ConfigDatabaseDialog onRecovered={loadOverview} />
      </>
    );
  }

  return (
    <>
      <main className="flex h-screen min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md space-y-3 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          <h1 className="text-lg font-semibold">正在准备默认工作区</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? `${APP_DISPLAY_NAME} 会自动使用默认工作区保存未绑定项目的会话。`
              : "默认工作区暂时不可用，请稍后重试。"}
          </p>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
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
