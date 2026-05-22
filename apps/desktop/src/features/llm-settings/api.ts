import { invoke } from "@tauri-apps/api/core";
import type { LlmSettings, LlmSettingsDraft } from "./types";

export const getLlmSettings = () => {
  return invoke<LlmSettings>("get_llm_settings");
};

export const saveLlmSettings = (input: LlmSettingsDraft) => {
  return invoke<LlmSettings>("save_llm_settings", { input });
};
