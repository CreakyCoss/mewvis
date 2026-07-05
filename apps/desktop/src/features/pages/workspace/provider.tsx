import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { WorkspaceFormDialog } from "@/features/pages/components/workspace-form-dialog";
import { isDefaultWorkspace } from "@/features/pages/workspace/default";
import { useOverview } from "@/features/pages/workspace/hooks/use-overview";
import { defaultWorkspaceForm, type Workspace } from "@/features/pages/workspace/types";
import { appStorageKey } from "@/product-config";

const ACTIVE_WORKSPACE_STORAGE_KEY = appStorageKey("active-workspace");

type WorkspaceOverviewState = ReturnType<typeof useOverview>;

type WorkspaceStore = WorkspaceOverviewState & {
  activeWorkspace: Workspace | null;
  defaultWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  saveWorkspaceAndActivate: () => Promise<Workspace | null>;
};

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

const createInitialOverviewState = (): WorkspaceOverviewState => ({
  overview: null,
  form: defaultWorkspaceForm,
  editingWorkspace: null,
  sections: [],
  isDialogOpen: false,
  isLoading: true,
  isSaving: false,
  deletingWorkspaceId: null,
  error: "",
  setForm: () => undefined,
  setIsDialogOpen: () => undefined,
  handleDialogOpenChange: () => undefined,
  openCreateWorkspace: () => undefined,
  openEditWorkspace: () => undefined,
  deleteWorkspace: async () => false,
  loadOverview: async () => undefined,
  saveWorkspace: async () => null,
});

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  ...createInitialOverviewState(),
  activeWorkspace: loadStoredWorkspace(),
  defaultWorkspace: null,
  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),
  saveWorkspaceAndActivate: async () => {
    const saved = await get().saveWorkspace();
    if (saved) {
      set({ activeWorkspace: saved });
    }
    return saved;
  },
}));

const syncWorkspaceStore = (overviewState: WorkspaceOverviewState, defaultWorkspace: Workspace | null) => {
  useWorkspaceStore.setState({
    ...overviewState,
    defaultWorkspace,
  });
};

type ProviderProps = {
  children: ReactNode;
};

export const WorkspaceProvider = ({ children }: ProviderProps) => {
  const overviewState = useOverview();
  const { overview } = overviewState;
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const defaultWorkspace = useMemo(() => overview?.workspaces.find(isDefaultWorkspace) ?? null, [overview]);
  const isStoreInitializedRef = useRef(false);

  if (!isStoreInitializedRef.current) {
    syncWorkspaceStore(overviewState, defaultWorkspace);
    isStoreInitializedRef.current = true;
  }

  useLayoutEffect(() => {
    syncWorkspaceStore(overviewState, defaultWorkspace);
  }, [defaultWorkspace, overviewState]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    if (activeWorkspace) {
      const latest = overview.workspaces.find((workspace) => workspace.id === activeWorkspace.id);
      if (
        latest &&
        (latest.updatedAt !== activeWorkspace.updatedAt || latest.isDefault !== activeWorkspace.isDefault)
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
      sessionStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, JSON.stringify(activeWorkspace));
      return;
    }

    sessionStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  }, [activeWorkspace]);

  return children;
};

export const useWorkspaceOverview = () => {
  return useWorkspaceStore();
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
