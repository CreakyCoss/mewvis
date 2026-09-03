import { create } from "zustand";
import { listPluginUi, type PluginUiCatalog } from "@/api/plugins";

type PluginCatalogState = {
  catalog: PluginUiCatalog;
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

let requestId = 0;

export const usePluginCatalogStore = create<PluginCatalogState>((set) => ({
  catalog: { plugins: [] },
  isLoading: false,
  error: "",
  refresh: async () => {
    const currentRequest = ++requestId;
    set({ isLoading: true, error: "" });
    try {
      const catalog = await listPluginUi();
      if (currentRequest === requestId) set({ catalog });
    } catch (error) {
      if (currentRequest === requestId) set({ error: String(error) });
    } finally {
      if (currentRequest === requestId) set({ isLoading: false });
    }
  },
}));
