import { create } from "zustand";
import type { LlmSettings } from "@/agent-client/runtime-model";
import { getLlmSettings } from "@/api/llm";

type LlmSettingsStore = {
  settings: LlmSettings;
  isLoading: boolean;
  error: string;
  loadSettings: () => Promise<void>;
};

let loadSettingsPromise: Promise<void> | null = null;

export const useLlmSettingsStore = create<LlmSettingsStore>((set) => ({
  settings: { providers: [] },
  isLoading: false,
  error: "",
  loadSettings: async () => {
    if (loadSettingsPromise) {
      await loadSettingsPromise;
      return;
    }

    loadSettingsPromise = (async () => {
      set({ isLoading: true, error: "" });
      try {
        const settings = await getLlmSettings({ refresh: true });
        set({
          settings,
          isLoading: false,
          error: "",
        });
      } catch (caught) {
        set({
          isLoading: false,
          error: String(caught),
        });
      } finally {
        loadSettingsPromise = null;
      }
    })();

    await loadSettingsPromise;
  },
}));

void useLlmSettingsStore.getState().loadSettings();
