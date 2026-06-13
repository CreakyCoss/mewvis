import { MODEL_CATALOG, type ApiFormat } from "./catalog";

export type ProviderOption = {
  value: string;
  label: string;
};

const apiFormatLabelEntries: Array<[ApiFormat, string]> = [
  ["openai-completions", "OpenAI Compatible"],
  ["openai-responses", "OpenAI Responses"],
  ["anthropic-messages", "Anthropic Messages"],
  ["google-generative-ai", "Google Generative AI"],
  ["azure-openai-responses", "Azure OpenAI Responses"],
  ["openai-codex-responses", "OpenAI Codex Responses"],
  ["openrouter", "OpenRouter"],
];

const apiFormatLabels = new Map<ApiFormat, string>(apiFormatLabelEntries);

export const getProviderCatalog = (provider: string) => {
  return MODEL_CATALOG[provider];
};

export const getProviderModels = (provider: string) => {
  return Object.values(getProviderCatalog(provider)?.models ?? {});
};

export const getProviderApis = (provider: string) => {
  return getProviderCatalog(provider)?.apis ?? [];
};

export const getApiFormatLabel = (apiFormat: string) => {
  return apiFormatLabels.get(apiFormat as ApiFormat) ?? apiFormat;
};

export const getProviderOptions = (): ProviderOption[] => {
  return Object.keys(MODEL_CATALOG)
    .filter((provider) => {
      const catalog = getProviderCatalog(provider);
      return Boolean(
        catalog &&
          Object.keys(catalog.models).length > 0 &&
          catalog.apis.length > 0,
      );
    })
    .map((provider) => ({
      value: provider,
      label: provider,
    }));
};

export const getProviderOption = (provider: string) => {
  return getProviderOptions().find((option) => option.value === provider);
};

export const getProviderWebsiteUrl = (provider: string) => {
  return getProviderCatalog(provider)?.websiteUrl ?? "";
};

export const getProviderApiFormats = (provider: string): ApiFormat[] => {
  const formats = new Set<ApiFormat>();

  for (const api of getProviderApis(provider)) {
    formats.add(api.apiFormat);
  }

  const orderedFormats = apiFormatLabelEntries
    .map(([apiFormat]) => apiFormat)
    .filter((apiFormat) => formats.has(apiFormat));
  const unknownFormats = [...formats].filter(
    (apiFormat) => !orderedFormats.includes(apiFormat),
  );

  return [...orderedFormats, ...unknownFormats];
};
