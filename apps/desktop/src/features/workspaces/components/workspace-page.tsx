import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { WorkspaceContent } from "./workspace-content";
import { WorkspacePageHeader } from "./workspace-page-header";
import { useWorkspaceOverview } from "../hooks/use-workspace-overview";

export function WorkspacePage() {
  const {
    overview,
    form,
    groupsWithWorkspaces,
    isDialogOpen,
    isLoading,
    isSaving,
    error,
    setForm,
    setIsDialogOpen,
    saveWorkspace,
  } = useWorkspaceOverview();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6">
        <WorkspacePageHeader
          configDbPath={overview?.configDbPath}
          onCreateWorkspace={() => setIsDialogOpen(true)}
        />

        {error && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="flex-1 py-6">
          <WorkspaceContent
            overview={overview}
            groupsWithWorkspaces={groupsWithWorkspaces}
            isLoading={isLoading}
            onCreateWorkspace={() => setIsDialogOpen(true)}
          />
        </section>
      </div>

      <CreateWorkspaceDialog
        open={isDialogOpen}
        form={form}
        groups={overview?.groups ?? []}
        groupsWithWorkspaces={groupsWithWorkspaces}
        isSaving={isSaving}
        onOpenChange={setIsDialogOpen}
        onFormChange={setForm}
        onSubmit={saveWorkspace}
      />
    </main>
  );
}
