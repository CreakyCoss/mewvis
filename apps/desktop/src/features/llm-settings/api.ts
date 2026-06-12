import { invoke, isTauri } from "@tauri-apps/api/core";
import type { LlmSettings, LlmSettingsDraft } from "@/features/llm-settings/types";

export const getLlmSettings = () => {
  if (!isTauri()) {
    return Promise.resolve<LlmSettings>({ providers: [] });
  }

  return invoke<LlmSettings>("get_llm_settings");
};

export const saveLlmSettings = (input: LlmSettingsDraft) => {
  if (!isTauri()) {
    return Promise.resolve<LlmSettings>({ providers: [] });
  }

  return invoke<LlmSettings>("save_llm_settings", { input });
};
