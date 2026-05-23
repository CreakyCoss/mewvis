import { useState } from "react";
import { SettingsDialog } from "@/features/llm-settings/components/dialog";
import { CreateDialog } from "./create-dialog";
import { Content } from "./content";
import { PageHeader } from "./page-header";
import { useOverview } from "../hooks/use-overview";
import type { Workspace } from "../types";

type WorkspacesPageProps = {
  onOpenWorkspace: (workspace: Workspace) => void;
};

export const WorkspacesPage = ({ onOpenWorkspace }: WorkspacesPageProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const {
    overview,
    form,
    sections,
    isDialogOpen,
    isLoading,
    isSaving,
    error,
    setForm,
    setIsDialogOpen,
    saveWorkspace,
  } = useOverview();

  return (
    <main className="min-h-screen bg-muted/35 text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6">
        <PageHeader
          configDbPath={overview?.configDbPath}
          onCreateWorkspace={() => setIsDialogOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {error && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="flex-1 py-7">
          <Content
            overview={overview}
            sections={sections}
            isLoading={isLoading}
            onCreateWorkspace={() => setIsDialogOpen(true)}
            onOpenWorkspace={onOpenWorkspace}
          />
        </section>
      </div>

      <CreateDialog
        open={isDialogOpen}
        form={form}
        groups={overview?.groups ?? []}
        sections={sections}
        isSaving={isSaving}
        onOpenChange={setIsDialogOpen}
        onFormChange={setForm}
        onSubmit={saveWorkspace}
      />

      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </main>
  );
};
