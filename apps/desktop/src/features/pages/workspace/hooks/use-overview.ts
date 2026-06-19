import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWorkspace,
  deleteWorkspace as deleteWorkspaceRecord,
  getWorkspaceOverview,
  updateWorkspace,
} from "../api";
import { isDefaultWorkspace } from "../default";
import {
  defaultWorkspaceForm,
  type Workspace,
  type WorkspaceForm,
  type WorkspaceOverview,
} from "../types";
import { buildSections } from "../utils/sections";

export const useOverview = () => {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [form, setForm] = useState<WorkspaceForm>(defaultWorkspaceForm);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await getWorkspaceOverview();
      setOverview(data);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const openCreateWorkspace = useCallback(() => {
    setError("");
    setEditingWorkspace(null);
    setForm(defaultWorkspaceForm);
    setIsDialogOpen(true);
  }, []);

  const openEditWorkspace = useCallback((workspace: Workspace) => {
    if (isDefaultWorkspace(workspace)) {
      setError("默认工作区由系统管理，不能编辑");
      return;
    }

    setError("");
    setEditingWorkspace(workspace);
    setForm({
      name: workspace.name,
      description: workspace.description ?? "",
      path: workspace.path,
      groupId: workspace.groupId ?? "",
    });
    setIsDialogOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setError("");
      setEditingWorkspace(null);
      setForm(defaultWorkspaceForm);
    }
  }, []);

  const sections = useMemo(
    () => buildSections(overview),
    [overview],
  );

  const saveWorkspace = useCallback(async (): Promise<Workspace | null> => {
    setIsSaving(true);
    setError("");

    try {
      const workspace = editingWorkspace
        ? await updateWorkspace(editingWorkspace.id, form)
        : await createWorkspace(form);
      setForm(defaultWorkspaceForm);
      setEditingWorkspace(null);
      setIsDialogOpen(false);
      await loadOverview();
      return workspace;
    } catch (caught) {
      setError(String(caught));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [editingWorkspace, form, loadOverview]);

  const deleteWorkspace = useCallback(async (workspace: Workspace): Promise<boolean> => {
    if (isDefaultWorkspace(workspace)) {
      setError("默认工作区由系统管理，不能删除");
      return false;
    }

    setDeletingWorkspaceId(workspace.id);
    setError("");

    try {
      await deleteWorkspaceRecord(workspace.id);
      await loadOverview();
      return true;
    } catch (caught) {
      setError(String(caught));
      return false;
    } finally {
      setDeletingWorkspaceId(null);
    }
  }, [loadOverview]);

  return {
    overview,
    form,
    editingWorkspace,
    sections,
    isDialogOpen,
    isLoading,
    isSaving,
    deletingWorkspaceId,
    error,
    setForm,
    setIsDialogOpen,
    handleDialogOpenChange,
    openCreateWorkspace,
    openEditWorkspace,
    deleteWorkspace,
    loadOverview,
    saveWorkspace,
  };
};
