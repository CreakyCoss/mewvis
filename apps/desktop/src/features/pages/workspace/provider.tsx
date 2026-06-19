import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WorkspaceFormDialog } from "@/features/pages/components/workspace-form-dialog";
import { isDefaultWorkspace } from "@/features/pages/workspace/default";
import { useOverview } from "@/features/pages/workspace/hooks/use-overview";
import type { Workspace } from "@/features/pages/workspace/types";
import { appStorageKey } from "@/product-config";

const ACTIVE_WORKSPACE_STORAGE_KEY = appStorageKey("active-workspace");

type WorkspaceContextValue = ReturnType<typeof useOverview> & {
  activeWorkspace: Workspace | null;
  defaultWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  saveWorkspaceAndActivate: () => Promise<Workspace | null>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const loadStoredWorkspace = () => {
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
};

type ProviderProps = {
  children: ReactNode;
};

export const WorkspaceProvider = ({ children }: ProviderProps) => {
  const overviewState = useOverview();
  const { overview, saveWorkspace } = overviewState;
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    loadStoredWorkspace,
  );
  const defaultWorkspace = useMemo(
    () => overview?.workspaces.find(isDefaultWorkspace) ?? null,
    [overview],
  );

  useEffect(() => {
    if (!overview) {
      return;
    }

    if (activeWorkspace) {
      const latest = overview.workspaces.find(
        (workspace) => workspace.id === activeWorkspace.id,
      );
      if (
        latest &&
        (latest.updatedAt !== activeWorkspace.updatedAt ||
          latest.isDefault !== activeWorkspace.isDefault)
      ) {
        setActiveWorkspace(latest);
      }
      if (!latest && overview.workspaces.length > 0) {
        setActiveWorkspace(defaultWorkspace ?? overview.workspaces[0]);
      }
      return;
    }

    if (overview.workspaces.length > 0) {
      setActiveWorkspace(defaultWorkspace ?? overview.workspaces[0]);
    }
  }, [activeWorkspace, defaultWorkspace, overview]);

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

  const saveWorkspaceAndActivate = async () => {
    const saved = await saveWorkspace();
    if (saved) {
      setActiveWorkspace(saved);
    }
    return saved;
  };

  const value = useMemo(
    () => ({
      ...overviewState,
      activeWorkspace,
      defaultWorkspace,
      setActiveWorkspace,
      saveWorkspaceAndActivate,
    }),
    [activeWorkspace, defaultWorkspace, overviewState, saveWorkspaceAndActivate],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspaceOverview = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceOverview must be used within WorkspaceProvider");
  }

  return context;
};

export const WorkspaceDialogHost = () => {
  const {
    overview,
    form,
    editingWorkspace,
    sections,
    isDialogOpen,
    isSaving,
    error,
    setForm,
    handleDialogOpenChange,
    saveWorkspaceAndActivate,
  } = useWorkspaceOverview();

  return (
    <WorkspaceFormDialog
      open={isDialogOpen}
      mode={editingWorkspace ? "edit" : "create"}
      form={form}
      groups={overview?.groups ?? []}
      sections={sections}
      isSaving={isSaving}
      error={error}
      onOpenChange={handleDialogOpenChange}
      onFormChange={setForm}
      onSubmit={saveWorkspaceAndActivate}
    />
  );
};
