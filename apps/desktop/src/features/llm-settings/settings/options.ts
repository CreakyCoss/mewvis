import { MODEL_CATALOG, type CatalogProviderApi } from "../catalog";

export type ApiFormatValue = CatalogProviderApi["apiFormat"] | "openrouter";

export type ApiFormatOption = {
  value: ApiFormatValue;
  label: string;
};

export type ProviderOption = {
  value: string;
  label: string;
};

export type ModelOption = {
  id: string;
  name: string;
};

const apiFormatLabelEntries: Array<[ApiFormatValue, string]> = [
  ["openai-completions", "OpenAI Compatible"],
  ["openai-responses", "OpenAI Responses"],
  ["anthropic-messages", "Anthropic Messages"],
  ["google-generative-ai", "Google Generative AI"],
  ["azure-openai-responses", "Azure OpenAI Responses"],
  ["openai-codex-responses", "OpenAI Codex Responses"],
  ["openrouter", "OpenRouter"],
];

const apiFormatLabels = new Map<ApiFormatValue, string>(apiFormatLabelEntries);

const apiFormatEndpointSuffix: Partial<Record<CatalogProviderApi["apiFormat"], string>> = {
  "anthropic-messages": "/anthropic",
  "openai-codex-responses": "/v1",
  "openai-completions": "/v1",
  "openai-responses": "/v1",
};

const getProviderCatalog = (provider: string) => {
  return MODEL_CATALOG[provider];
};

const getProviderModelEntries = (provider: string) => {
  return Object.values(getProviderCatalog(provider)?.models ?? {});
};

const getProviderApis = (provider: string) => {
  return getProviderCatalog(provider)?.apis ?? [];
};

const normalizeWebsiteUrl = (websiteUrl: string) => {
  return websiteUrl.trim().replace(/\/+$/, "");
};

const inferApiEndpointFromWebsite = (
  provider: string,
  apiFormat: string,
) => {
  const websiteUrl = normalizeWebsiteUrl(
    getProviderCatalog(provider)?.websiteUrl ?? "",
  );
  if (!websiteUrl) return "";

  return `${websiteUrl}${apiFormatEndpointSuffix[apiFormat as CatalogProviderApi["apiFormat"]] ?? ""}`;
};

const resolveApiEndpoint = (provider: string, apiFormat: string) => {
  const api = getProviderApis(provider).find(
    (item) => item.apiFormat === apiFormat,
  );

  return api?.apiEndpoint ?? inferApiEndpointFromWebsite(provider, apiFormat);
};

export const getApiFormatLabel = (apiFormat: string) => {
  return apiFormatLabels.get(apiFormat as ApiFormatValue) ?? apiFormat;
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

export const getProviderModels = (provider: string) => {
  return getProviderModelEntries(provider);
};

export const getProviderApiFormats = (provider: string): ApiFormatValue[] => {
  const formats = new Set<ApiFormatValue>();

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

export const getProviderApiFormatOptions = (
  provider: string,
): ApiFormatOption[] => {
  return getProviderApiFormats(provider).map((apiFormat) => ({
    value: apiFormat,
    label: getApiFormatLabel(apiFormat),
  }));
};

export const getDefaultApiFormat = (provider: string): ApiFormatValue => {
  return getProviderApiFormats(provider)[0] ?? "openai-completions";
};

export const getProviderModelOptions = (provider: string): ModelOption[] => {
  return getProviderModels(provider).map((model) => ({
    id: model.id,
    name: model.name,
  }));
};

export const inferApiEndpoint = (provider: string, apiFormat: string) => {
  if (apiFormat === "openrouter") {
    return "https://openrouter.ai/api/v1";
  }

  return resolveApiEndpoint(provider, apiFormat);
};
