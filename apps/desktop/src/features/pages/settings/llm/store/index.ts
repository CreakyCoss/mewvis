import { create } from "zustand";
import type { RuntimeModelInput } from "@/agent-client/types";
import { getLlmSettings } from "../api";
import {
  buildRuntimeModelInputs,
  buildRuntimeModelOptions,
  type RuntimeModelOption,
} from "./model";
import type { LlmSettings } from "../types";

export { type RuntimeModelOption } from "./model";

type LlmSettingsStore = {
  settings: LlmSettings;
  runtimeModels: RuntimeModelOption[];
  runtimeModelInputs: Record<string, RuntimeModelInput>;
  isLoading: boolean;
  error: string;
  loadSettings: () => Promise<void>;
  getRuntimeModelInput: (id?: string | null) => RuntimeModelInput | null;
};

let loadSettingsPromise: Promise<void> | null = null;

export const useLlmSettingsStore = create<LlmSettingsStore>(
  (set, get) => ({
    settings: { providers: [] },
    runtimeModels: [],
    runtimeModelInputs: {},
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
          const settings = await getLlmSettings();
          const runtimeModels = buildRuntimeModelOptions(settings);
          const runtimeModelInputs = buildRuntimeModelInputs(settings);
          set({
            settings,
            runtimeModels,
            runtimeModelInputs,
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
    getRuntimeModelInput: (id) => {
      const state = get();
      return id ? state.runtimeModelInputs[id] ?? null : null;
    },
  }),
);

void useLlmSettingsStore.getState().loadSettings();

export const resolveRuntimeModelInput = (id?: string | null) =>
  useLlmSettingsStore.getState().getRuntimeModelInput(id);

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
