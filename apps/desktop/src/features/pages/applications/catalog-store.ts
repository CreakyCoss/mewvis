import { create } from "zustand";
import { listApplicationUi, type ApplicationUiCatalog } from "@/api/applications";

type ApplicationCatalogState = {
  catalog: ApplicationUiCatalog;
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

let requestId = 0;

export const useApplicationCatalogStore = create<ApplicationCatalogState>((set) => ({
  catalog: { applications: [] },
  isLoading: false,
  error: "",
  refresh: async () => {
    const currentRequest = ++requestId;
    set({ isLoading: true, error: "" });
    try {
      const catalog = await listApplicationUi();
      if (currentRequest === requestId) set({ catalog });
    } catch (error) {
      if (currentRequest === requestId) set({ error: String(error) });
    } finally {
      if (currentRequest === requestId) set({ isLoading: false });
    }
  },
}));
