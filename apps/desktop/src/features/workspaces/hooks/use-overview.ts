import { useCallback, useEffect, useMemo, useState } from "react";
import { createWorkspace, getWorkspaceOverview } from "../api";
import {
  defaultWorkspaceForm,
  type WorkspaceForm,
  type WorkspaceOverview,
} from "../types";
import { buildSections } from "../utils/sections";

export const useOverview = () => {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [form, setForm] = useState<WorkspaceForm>(defaultWorkspaceForm);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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

  const sections = useMemo(
    () => buildSections(overview),
    [overview],
  );

  const saveWorkspace = useCallback(async () => {
    setIsSaving(true);
    setError("");

    try {
      await createWorkspace(form);
      setForm(defaultWorkspaceForm);
      setIsDialogOpen(false);
      await loadOverview();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  }, [form, loadOverview]);

  return {
    overview,
    form,
    sections,
    isDialogOpen,
    isLoading,
    isSaving,
    error,
    setForm,
    setIsDialogOpen,
    loadOverview,
    saveWorkspace,
  };
};
