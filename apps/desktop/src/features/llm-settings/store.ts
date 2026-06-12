import { create } from "zustand";
import { getLlmSettings } from "./api";
import {
  buildRuntimeModelOptions,
  findDefaultRuntimeModel,
  findRuntimeModelByKey,
  findRuntimeModelByLegacyIds,
  type RuntimeModelOption,
} from "./runtime-models";

type LlmRuntimeModelStore = {
  runtimeModels: RuntimeModelOption[];
  selectedRuntimeModelKey: string;
  isLoading: boolean;
  error: string;
  loadRuntimeModels: () => Promise<void>;
  refreshRuntimeModels: () => Promise<void>;
  setSelectedRuntimeModelKey: (key: string) => void;
  getRuntimeModel: (key?: string | null) => RuntimeModelOption | null;
  findRuntimeModelByLegacyIds: (
    providerId?: string | null,
    modelSettingId?: string | null,
  ) => RuntimeModelOption | null;
};

export const useLlmRuntimeModelStore = create<LlmRuntimeModelStore>((set, get) => ({
  runtimeModels: [],
  selectedRuntimeModelKey: "",
  isLoading: false,
  error: "",
  loadRuntimeModels: async () => {
    set({ isLoading: true, error: "" });
    try {
      const settings = await getLlmSettings();
      const runtimeModels = buildRuntimeModelOptions(settings);
      const current = findRuntimeModelByKey(runtimeModels, get().selectedRuntimeModelKey);
      const selectedRuntimeModelKey = current?.key ?? findDefaultRuntimeModel(runtimeModels)?.key ?? "";
      set({
        runtimeModels,
        selectedRuntimeModelKey,
        isLoading: false,
        error: "",
      });
    } catch (caught) {
      set({
        isLoading: false,
        error: String(caught),
      });
    }
  },
  refreshRuntimeModels: async () => {
    await get().loadRuntimeModels();
  },
  setSelectedRuntimeModelKey: (key) => {
    set({ selectedRuntimeModelKey: key });
  },
  getRuntimeModel: (key) => {
    const state = get();
    return findRuntimeModelByKey(
      state.runtimeModels,
      key ?? state.selectedRuntimeModelKey,
    );
  },
  findRuntimeModelByLegacyIds: (providerId, modelSettingId) =>
    findRuntimeModelByLegacyIds(get().runtimeModels, providerId, modelSettingId),
}));
