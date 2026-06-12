import { create } from "zustand";
import { getLlmSettings } from "../settings/api";
import {
  buildRuntimeModelOptions,
  findDefaultRuntimeModel,
  findRuntimeModelById,
  type RuntimeModelOption,
} from "./model";

type LlmRuntimeModelStore = {
  runtimeModels: RuntimeModelOption[];
  selectedRuntimeModelId: string;
  isLoading: boolean;
  error: string;
  loadRuntimeModels: () => Promise<void>;
  refreshRuntimeModels: () => Promise<void>;
  setSelectedRuntimeModelId: (id: string) => void;
  getRuntimeModel: (id?: string | null) => RuntimeModelOption | null;
};

const resolveSelectedRuntimeModelId = (
  runtimeModels: RuntimeModelOption[],
  currentId: string,
) => {
  const current = findRuntimeModelById(runtimeModels, currentId);
  return current?.id ?? findDefaultRuntimeModel(runtimeModels)?.id ?? "";
};

export const useLlmRuntimeModelStore = create<LlmRuntimeModelStore>(
  (set, get) => ({
    runtimeModels: [],
    selectedRuntimeModelId: "",
    isLoading: false,
    error: "",
    loadRuntimeModels: async () => {
      set({ isLoading: true, error: "" });
      try {
        const settings = await getLlmSettings();
        const runtimeModels = buildRuntimeModelOptions(settings);
        const selectedRuntimeModelId = resolveSelectedRuntimeModelId(
          runtimeModels,
          get().selectedRuntimeModelId,
        );
        set({
          runtimeModels,
          selectedRuntimeModelId,
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
    setSelectedRuntimeModelId: (id) => {
      set({ selectedRuntimeModelId: id });
    },
    getRuntimeModel: (id) => {
      const state = get();
      return findRuntimeModelById(
        state.runtimeModels,
        id ?? state.selectedRuntimeModelId,
      );
    },
  }),
);
