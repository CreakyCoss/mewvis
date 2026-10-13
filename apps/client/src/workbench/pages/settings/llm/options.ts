import { MODEL_CATALOG } from "@/agent-client/model-catalog";
import type { RuntimeApiFormat, RuntimeModelModality, RuntimeModelOperation } from "@/agent-client/wire";

export const MODEL_MODALITY_OPTIONS: { value: RuntimeModelModality; label: string }[] = [
  { value: "text", label: "文字" },
  { value: "image", label: "图片" },
  { value: "audio", label: "音频" },
  { value: "video", label: "视频" },
];
export const MODEL_OPERATION_OPTIONS: { value: RuntimeModelOperation; label: string }[] = [
  { value: "chat", label: "对话" },
  { value: "image-generation", label: "图像生成" },
  { value: "image-editing", label: "图像编辑" },
  { value: "video-generation", label: "视频生成" },
  { value: "speech", label: "语音合成" },
  { value: "transcription", label: "语音转写" },
  { value: "realtime", label: "实时对话" },
];
export const formatContextWindow = (value: number) =>
  value >= 1000000
    ? `${Number((value / 1000000).toFixed(2))}M`
    : value >= 1000
      ? `${Number((value / 1000).toFixed(1))}K`
      : String(value);

// Suggestions only: providers may accept values outside this list.
export const THINKING_LEVEL_PRESETS = [
  { value: "off", label: "关闭" },
  { value: "minimal", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
  { value: "max", label: "最高" },
];

export type ProviderOption = {
  value: string;
  label: string;
};

type ApiFormatOption = {
  value: RuntimeApiFormat;
  label: string;
};

type ModelOption = {
  id: string;
  name: string;
};

const apiFormatLabelEntries: Array<[RuntimeApiFormat, string]> = [
  ["openai-completions", "OpenAI Compatible"],
  ["openai-responses", "OpenAI Responses"],
  ["anthropic-messages", "Anthropic Messages"],
  ["google-generative-ai", "Google Generative AI"],
  ["azure-openai-responses", "Azure OpenAI Responses"],
  ["openai-codex-responses", "OpenAI Codex Responses"],
  ["openrouter", "OpenRouter"],
];

const apiFormatLabels = new Map<RuntimeApiFormat, string>(apiFormatLabelEntries);

const providerLabels = new Map<string, string>([
  ["openai", "OpenAI"],
  ["deepseek", "DeepSeek"],
  ["minimax-cn", "MiniMax"],
  ["zhipuai", "GLM"],
  ["moonshotai-cn", "Kimi"],
  ["xiaomi", "MiMo"],
]);

const apiFormatEndpointSuffix: Partial<Record<RuntimeApiFormat, string>> = {
  "anthropic-messages": "/anthropic",
  "openai-codex-responses": "/v1",
  "openai-completions": "/v1",
  "openai-responses": "/v1",
};

const normalizeWebsiteUrl = (websiteUrl: string) => {
  return websiteUrl.trim().replace(/\/+$/, "");
};

const inferApiEndpointFromWebsite = (provider: string, apiFormat: RuntimeApiFormat) => {
  const websiteUrl = normalizeWebsiteUrl(getProviderCatalog(provider)?.websiteUrl ?? "");
  if (!websiteUrl) return "";

  return `${websiteUrl}${apiFormatEndpointSuffix[apiFormat] ?? ""}`;
};

const resolveApiEndpoint = (provider: string, apiFormat: RuntimeApiFormat) => {
  const api = getProviderApis(provider).find((item) => item.apiFormat === apiFormat);

  return api?.apiEndpoint ?? inferApiEndpointFromWebsite(provider, apiFormat);
};

export const getProviderCatalog = (provider: string) => {
  return Object.prototype.hasOwnProperty.call(MODEL_CATALOG, provider) ? MODEL_CATALOG[provider] : undefined;
};

export const getProviderModels = (provider: string) => {
  return Object.values(getProviderCatalog(provider)?.models ?? {});
};

export const getProviderApis = (provider: string) => {
  return getProviderCatalog(provider)?.apis ?? [];
};

export const getApiFormatLabel = (apiFormat: string) => {
  return apiFormatLabels.get(apiFormat as RuntimeApiFormat) ?? apiFormat;
};

export const getProviderOptions = (): ProviderOption[] => {
  return Object.keys(MODEL_CATALOG)
    .filter((provider) => {
      const catalog = getProviderCatalog(provider);
      return Boolean(catalog && Object.keys(catalog.models).length > 0 && catalog.apis.length > 0);
    })
    .map((provider) => ({
      value: provider,
      label: providerLabels.get(provider) ?? provider,
    }));
};

export const getProviderOption = (provider: string) => {
  return getProviderOptions().find((option) => option.value === provider);
};

export const getProviderWebsiteUrl = (provider: string) => {
  return getProviderCatalog(provider)?.websiteUrl ?? "";
};

export const getProviderApiFormats = (provider: string): RuntimeApiFormat[] => {
  const formats = new Set<RuntimeApiFormat>();

  for (const api of getProviderApis(provider)) {
    formats.add(api.apiFormat);
  }

  if (formats.size === 0) return apiFormatLabelEntries.map(([apiFormat]) => apiFormat);

  const orderedFormats = apiFormatLabelEntries
    .map(([apiFormat]) => apiFormat)
    .filter((apiFormat) => formats.has(apiFormat));
  const unknownFormats = [...formats].filter((apiFormat) => !orderedFormats.includes(apiFormat));

  return [...orderedFormats, ...unknownFormats];
};

export const getProviderApiFormatOptions = (provider: string): ApiFormatOption[] => {
  return getProviderApiFormats(provider).map((apiFormat) => ({
    value: apiFormat,
    label: getApiFormatLabel(apiFormat),
  }));
};

export const getDefaultApiFormat = (provider: string): RuntimeApiFormat => {
  return getProviderApis(provider)[0]?.apiFormat ?? getProviderApiFormats(provider)[0] ?? "openai-completions";
};

export const getProviderModelOptions = (provider: string): ModelOption[] => {
  return getProviderModels(provider).map((model) => ({
    id: model.id,
    name: model.name,
  }));
};

export const inferApiEndpoint = (provider: string, apiFormat: RuntimeApiFormat) => {
  if (apiFormat === "openrouter") {
    return "https://openrouter.ai/api/v1";
  }

  return resolveApiEndpoint(provider, apiFormat);
};
