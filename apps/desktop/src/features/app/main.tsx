import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { ConfigDatabaseDialog } from "./recovery";
import {
  WorkspaceChatPage,
  type WorkspaceChatShellProps,
} from "@/features/workspace/chat/components/page";
import { CreateDialog } from "@/features/workspace/components/create-dialog";
import { isDefaultWorkspace } from "@/features/workspace/default-workspace";
import { useOverview } from "@/features/workspace/hooks/use-overview";
import { Sidebar } from "@/features/workspace/shell/sidebar";
import { WorkbenchHeader } from "@/features/workspace/shell/workbench-header";
import type { Workspace } from "@/features/workspace/types";
import { APP_DISPLAY_NAME, appStorageKey } from "@/product-config";

const ACTIVE_WORKSPACE_STORAGE_KEY = appStorageKey("active-workspace");

export const AppContent = () => {
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

  const renderWorkspaceShell = ({
    dialogs,
    sidebarProps,
    headerProps,
    content,
    contextPanel,
    isTavernImmersive,
  }: WorkspaceChatShellProps) => {
    return (
      <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
        {dialogs}
        {sidebarProps && <Sidebar {...sidebarProps} />}
        {headerProps && <WorkbenchHeader {...headerProps} />}

        <section
          className={[
            "flex min-w-0 flex-1 flex-col bg-background",
            isTavernImmersive ? "pt-0" : "pt-12",
          ].join(" ")}
        >
          <div
            className={[
              "flex min-h-0 flex-1 overflow-hidden",
              isTavernImmersive ? "bg-background" : "bg-muted/20",
            ].join(" ")}
          >
            <div
              className={[
                "min-w-0 flex-1 overflow-hidden",
                isTavernImmersive
                  ? "bg-background"
                  : "bg-background/95 shadow-[inset_8px_0_24px_-28px_rgb(15_23_42_/_0.35),inset_-8px_0_24px_-28px_rgb(15_23_42_/_0.28)]",
              ].join(" ")}
            >
              {content}
            </div>

            {contextPanel}
          </div>
        </section>
      </main>
    );
  };

  if (activeWorkspace) {
    return (
      <>
        <WorkspaceChatPage
          workspace={activeWorkspace}
          workspaceSections={sections}
          isWorkspaceOverviewLoading={isLoading}
          workspaceOverviewError={error}
          onOpenWorkspace={setActiveWorkspace}
          onCreateWorkspace={openCreateWorkspace}
          onEditWorkspace={handleOpenEditWorkspace}
          renderShell={renderWorkspaceShell}
        />
        {workspaceDialog}
        <ConfigDatabaseDialog onRecovered={loadOverview} />
        <Toaster position="top-center" />
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
      <Toaster position="top-center" />
    </>
  );
};
