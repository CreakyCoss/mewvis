import {
  getCatalogModels,
  getCatalogProviders,
  type RuntimeModelCatalogEntry,
} from "@/ai/llm/model-catalog";

export type ApiFormatValue = RuntimeModelCatalogEntry["apiFormat"] | "openrouter";

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

const readModels = (provider: string) => {
  return getCatalogModels(provider);
};

const isOpenAiApiFormat = (apiFormat: string) => {
  return (
    apiFormat === "openai" ||
    apiFormat === "openai-completions" ||
    apiFormat === "openai-responses" ||
    apiFormat === "azure-openai-responses" ||
    apiFormat === "openai-codex-responses"
  );
};

const isAnthropicApiFormat = (apiFormat: string) => {
  return apiFormat === "anthropic" || apiFormat === "anthropic-messages";
};

const displayProvider = (provider: string) => {
  return provider;
};

export const getApiFormatLabel = (apiFormat: string) => {
  return apiFormatLabels.get(apiFormat as ApiFormatValue) ?? apiFormat;
};

export const getModelApiFormat = (
  provider: string,
  model: RuntimeModelCatalogEntry,
): ApiFormatValue | null => {
  if (provider === "openrouter") {
    return "openrouter";
  }

  return model.apiFormat;
};

export const getProviderOptions = (): ProviderOption[] => {
  return getCatalogProviders()
    .filter((provider) =>
      readModels(provider).some((model) => getModelApiFormat(provider, model)),
    )
    .map((provider) => ({
      value: provider,
      label: displayProvider(provider),
    }));
};

export const getProviderOption = (provider: string) => {
  return getProviderOptions().find((option) => option.value === provider);
};

export const getProviderModels = (provider: string) => {
  return readModels(provider);
};

export const getProviderApiFormats = (provider: string): ApiFormatValue[] => {
  const formats = new Set<ApiFormatValue>();

  for (const model of getProviderModels(provider)) {
    const apiFormat = getModelApiFormat(provider, model);

    if (apiFormat) {
      formats.add(apiFormat);
    }
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

export const getProviderModelOptions = (
  provider: string,
  apiFormat: string,
): ModelOption[] => {
  const exactModels = getProviderModels(provider).filter(
    (model) => getModelApiFormat(provider, model) === apiFormat,
  );
  const models = exactModels.length ? exactModels : getProviderModels(provider);

  return models.map((model) => ({
    id: model.id,
    name: model.name,
  }));
};

export const inferApiEndpoint = (provider: string, apiFormat: string) => {
  const exactModel = getProviderModels(provider).find(
    (model) => getModelApiFormat(provider, model) === apiFormat,
  );

  if (exactModel) {
    return exactModel.apiEndpoint;
  }

  const fallbackApiEndpoint = getProviderModels(provider)[0]?.apiEndpoint ?? "";

  if (isOpenAiApiFormat(apiFormat)) {
    if (fallbackApiEndpoint.endsWith("/anthropic")) {
      return fallbackApiEndpoint.replace(/\/anthropic$/, "/v1");
    }

    if (fallbackApiEndpoint.includes("/anthropic")) {
      return fallbackApiEndpoint.replace("/anthropic", "/v1");
    }
  }

  if (isAnthropicApiFormat(apiFormat) && fallbackApiEndpoint.endsWith("/v1")) {
    return fallbackApiEndpoint.replace(/\/v1$/, "/anthropic");
  }

  if (apiFormat === "openrouter") {
    return "https://openrouter.ai/api/v1";
  }

  return fallbackApiEndpoint;
};
