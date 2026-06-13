import type { CatalogProviderApi } from "../catalog";
import {
  getApiFormatLabel,
  getProviderApiFormats,
  getProviderApis,
  getProviderCatalog,
  getProviderModels,
  type ApiFormatValue,
} from "../options";

type ApiFormatOption = {
  value: ApiFormatValue;
  label: string;
};

type ModelOption = {
  id: string;
  name: string;
};

const apiFormatEndpointSuffix: Partial<
  Record<CatalogProviderApi["apiFormat"], string>
> = {
  "anthropic-messages": "/anthropic",
  "openai-codex-responses": "/v1",
  "openai-completions": "/v1",
  "openai-responses": "/v1",
};

const normalizeWebsiteUrl = (websiteUrl: string) => {
  return websiteUrl.trim().replace(/\/+$/, "");
};

const inferApiEndpointFromWebsite = (provider: string, apiFormat: string) => {
  const websiteUrl = normalizeWebsiteUrl(
    getProviderCatalog(provider)?.websiteUrl ?? "",
  );
  if (!websiteUrl) return "";

  return `${websiteUrl}${
    apiFormatEndpointSuffix[apiFormat as CatalogProviderApi["apiFormat"]] ?? ""
  }`;
};

const resolveApiEndpoint = (provider: string, apiFormat: string) => {
  const api = getProviderApis(provider).find(
    (item) => item.apiFormat === apiFormat,
  );

  return api?.apiEndpoint ?? inferApiEndpointFromWebsite(provider, apiFormat);
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
