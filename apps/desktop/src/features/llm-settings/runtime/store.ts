import { create } from "zustand";
import type { AgentRuntimeModelInput } from "@/ai/agent-runtime/contracts";
import { getLlmSettings } from "../settings/api";
import {
  buildRuntimeModelInputs,
  buildRuntimeModelOptions,
  type RuntimeModelOption,
} from "./model";

type LlmRuntimeModelStore = {
  runtimeModels: RuntimeModelOption[];
  runtimeModelInputs: Record<string, AgentRuntimeModelInput>;
  selectedRuntimeModelId: string;
  isLoading: boolean;
  error: string;
  loadRuntimeModels: () => Promise<void>;
  refreshRuntimeModels: () => Promise<void>;
  setSelectedRuntimeModelId: (id: string) => void;
  getRuntimeModelInput: (id?: string | null) => AgentRuntimeModelInput | null;
};

const resolveSelectedRuntimeModelId = (
  runtimeModels: RuntimeModelOption[],
  currentId: string,
) => {
  const current = runtimeModels.find((model) => model.id === currentId);
  return current?.id ?? runtimeModels[0]?.id ?? "";
};

export const useLlmRuntimeModelStore = create<LlmRuntimeModelStore>(
  (set, get) => ({
    runtimeModels: [],
    runtimeModelInputs: {},
    selectedRuntimeModelId: "",
    isLoading: false,
    error: "",
    loadRuntimeModels: async () => {
      set({ isLoading: true, error: "" });
      try {
        const settings = await getLlmSettings();
        const runtimeModels = buildRuntimeModelOptions(settings);
        const runtimeModelInputs = buildRuntimeModelInputs(settings);
        const selectedRuntimeModelId = resolveSelectedRuntimeModelId(
          runtimeModels,
          get().selectedRuntimeModelId,
        );
        set({
          runtimeModels,
          runtimeModelInputs,
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
    getRuntimeModelInput: (id) => {
      const state = get();
      const runtimeModelId = id ?? state.selectedRuntimeModelId;
      return runtimeModelId
        ? state.runtimeModelInputs[runtimeModelId] ?? null
        : null;
    },
  }),
);

export const resolveRuntimeModelInput = (id?: string | null) =>
  useLlmRuntimeModelStore.getState().getRuntimeModelInput(id);

export const requireRuntimeModelInput = (
  runtimeModel: RuntimeModelOption,
  message = "当前模型配置已不可用，请重新选择模型。",
) => {
  const runtimeModelInput = resolveRuntimeModelInput(runtimeModel.id);

  if (!runtimeModelInput) {
    throw new Error(message);
  }

  return runtimeModelInput;
};
