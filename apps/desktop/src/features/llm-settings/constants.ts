import {
  getCatalogModels,
  getCatalogProviders,
  type RuntimeModelCatalogEntry,
} from "@/ai/llm/model-catalog";

export type ProviderType = "anthropic" | "openai" | "google" | "openrouter";

export type ProviderTypeOption = {
  value: ProviderType;
  label: string;
};

export type VendorOption = {
  value: string;
  label: string;
};

export type ModelOption = {
  id: string;
  name: string;
};

const readModels = (provider: string) => {
  return getCatalogModels(provider);
};

export const providerTypeOptions: ProviderTypeOption[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
];

const providerTypeLabels = new Map(
  providerTypeOptions.map((option) => [option.value, option.label]),
);

const displayVendor = (vendor: string) => {
  return vendor;
};

export const getProviderTypeLabel = (providerType: string) => {
  return providerTypeLabels.get(providerType as ProviderType) ?? providerType;
};

export const getModelProviderType = (
  vendor: string,
  model: RuntimeModelCatalogEntry,
): ProviderType | null => {
  if (vendor === "openrouter") {
    return "openrouter";
  }

  if (model.apiFormat === "anthropic-messages") {
    return "anthropic";
  }

  if (model.apiFormat === "google-generative-ai") {
    return "google";
  }

  if (
    model.apiFormat === "openai-completions" ||
    model.apiFormat === "openai-responses" ||
    model.apiFormat === "azure-openai-responses" ||
    model.apiFormat === "openai-codex-responses"
  ) {
    return "openai";
  }

  return null;
};

export const getVendorOptions = (): VendorOption[] => {
  return getCatalogProviders()
    .filter((vendor) =>
      readModels(vendor).some((model) => getModelProviderType(vendor, model)),
    )
    .map((vendor) => ({
      value: vendor,
      label: displayVendor(vendor),
    }));
};

export const getVendorOption = (vendor: string) => {
  return getVendorOptions().find((option) => option.value === vendor);
};

export const getVendorModels = (vendor: string) => {
  return readModels(vendor);
};

export const getVendorProviderTypes = (vendor: string): ProviderType[] => {
  const types = new Set<ProviderType>();

  for (const model of getVendorModels(vendor)) {
    const type = getModelProviderType(vendor, model);

    if (type) {
      types.add(type);
    }
  }

  return providerTypeOptions
    .map((option) => option.value)
    .filter((type) => types.has(type));
};

export const getDefaultProviderType = (vendor: string): ProviderType => {
  return getVendorProviderTypes(vendor)[0] ?? "openai";
};

export const getVendorModelOptions = (
  vendor: string,
  providerType: string,
): ModelOption[] => {
  const exactModels = getVendorModels(vendor).filter(
    (model) => getModelProviderType(vendor, model) === providerType,
  );
  const models = exactModels.length ? exactModels : getVendorModels(vendor);

  return models.map((model) => ({
    id: model.id,
    name: model.name,
  }));
};

export const inferBaseUrl = (vendor: string, providerType: string) => {
  const exactModel = getVendorModels(vendor).find(
    (model) => getModelProviderType(vendor, model) === providerType,
  );

  if (exactModel) {
    return exactModel.apiEndpoint;
  }

  const fallbackBaseUrl = getVendorModels(vendor)[0]?.apiEndpoint ?? "";

  if (providerType === "openai") {
    if (fallbackBaseUrl.endsWith("/anthropic")) {
      return fallbackBaseUrl.replace(/\/anthropic$/, "/v1");
    }

    if (fallbackBaseUrl.includes("/anthropic")) {
      return fallbackBaseUrl.replace("/anthropic", "/v1");
    }
  }

  if (providerType === "anthropic" && fallbackBaseUrl.endsWith("/v1")) {
    return fallbackBaseUrl.replace(/\/v1$/, "/anthropic");
  }

  if (providerType === "openrouter") {
    return "https://openrouter.ai/api/v1";
  }

  return fallbackBaseUrl;
};
