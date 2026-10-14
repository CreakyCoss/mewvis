import { editorPresets } from "./edit/presets";
import type { RuntimeApiFormat } from "@/agent-client/wire";

export const MODEL_MODALITY_OPTIONS = editorPresets.modalities;
export const MODEL_OPERATION_OPTIONS = editorPresets.operations;
export const formatContextWindow = (value: number) =>
  value >= 1000000
    ? `${Number((value / 1000000).toFixed(2))}M`
    : value >= 1000
      ? `${Number((value / 1000).toFixed(1))}K`
      : String(value);

// Suggestions only: providers may accept values outside this list.
export const THINKING_LEVEL_PRESETS = editorPresets.thinkingLevels;

export type ProviderOption = {
  value: string;
  label: string;
};

export const getProviderApis = (provider: string) => {
  return editorPresets.getProvider(provider)?.apis ?? [];
};

export const getApiFormatLabel = editorPresets.getApiFormatLabel;

export const getProviderOptions = (): ProviderOption[] => {
  return editorPresets.listProviders().map((preset) => ({ value: preset.id, label: preset.label }));
};

export const getProviderOption = (provider: string) => {
  return getProviderOptions().find((option) => option.value === provider);
};

export const getProviderWebsiteUrl = (provider: string) => {
  return editorPresets.getProvider(provider)?.websiteUrl ?? "";
};

export const getProviderApiFormats = (provider: string): RuntimeApiFormat[] => {
  return editorPresets.getApiFormats(provider).map((option) => option.value);
};

export const getProviderApiFormatOptions = editorPresets.getApiFormats;
export const getDefaultApiFormat = editorPresets.getDefaultApiFormat;
export const inferApiEndpoint = editorPresets.getApiEndpoint;
