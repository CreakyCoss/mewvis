import { MODEL_CATALOG, MODEL_PROVIDER_ID_ALIASES } from "@/agent-client/model-catalog";
import type { RuntimeApiFormat } from "@/agent-client/wire";

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
  ["deepseek", "DeepSeek"],
  ["minimax-cn", "MiniMax"],
  ["glm", "GLM"],
  ["moonshotai-cn", "Kimi"],
  ["mimo", "MiMo"],
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
  const catalogProvider = MODEL_PROVIDER_ID_ALIASES[provider] ?? provider;
  return Object.prototype.hasOwnProperty.call(MODEL_CATALOG, catalogProvider)
    ? MODEL_CATALOG[catalogProvider]
    : undefined;
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
  const optionProvider = MODEL_PROVIDER_ID_ALIASES[provider] ?? provider;
  return getProviderOptions().find((option) => option.value === optionProvider);
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
  return getProviderApiFormats(provider)[0] ?? "openai-completions";
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
