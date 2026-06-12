import {
  API_FORMAT_ENDPOINT_SUFFIX,
  PROVIDER_RUNTIME_CONFIG,
} from "./config";
import { RAW_MODEL_CATALOG } from "./data";
import type {
  ApiFormat,
  ModelCatalog,
  ProviderRuntimeApi,
  RawModelCatalog,
  RawModelCatalogEntry,
  RuntimeModelCatalogEntry,
} from "./types";

const rawModelCatalog = RAW_MODEL_CATALOG satisfies RawModelCatalog;

const normalizeWebsiteUrl = (websiteUrl: string) => {
  return websiteUrl.trim().replace(/\/+$/, "");
};

const inferApiEndpoint = (apiFormat: ApiFormat, websiteUrl: string) => {
  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  if (!normalizedUrl) return "";

  return `${normalizedUrl}${API_FORMAT_ENDPOINT_SUFFIX[apiFormat] ?? ""}`;
};

const toRuntimeModelCatalogEntry = (
  provider: string,
  runtimeApi: ProviderRuntimeApi,
  websiteUrl: string,
  model: RawModelCatalogEntry,
): RuntimeModelCatalogEntry => ({
  ...model,
  input: [...model.input],
  apiFormat: runtimeApi.apiFormat,
  provider,
  apiEndpoint: runtimeApi.apiEndpoint ?? inferApiEndpoint(runtimeApi.apiFormat, websiteUrl),
  websiteUrl,
});

const getConfiguredRawModels = (
  rawModels: Record<string, RawModelCatalogEntry>,
  modelIds?: string[],
) => {
  if (!modelIds) {
    return Object.values(rawModels);
  }

  return modelIds
    .map((modelId) => rawModels[modelId])
    .filter((model): model is RawModelCatalogEntry => Boolean(model));
};

const buildModelCatalog = (): ModelCatalog => {
  const catalog: ModelCatalog = {};

  for (const [provider, rawProviderCatalog] of Object.entries(rawModelCatalog)) {
    const runtimeConfig = PROVIDER_RUNTIME_CONFIG[provider];
    if (!runtimeConfig) continue;

    const rawModels = getConfiguredRawModels(rawProviderCatalog.models, runtimeConfig.models);
    const models = rawModels.flatMap((model) =>
      runtimeConfig.apis.map((runtimeApi) =>
        toRuntimeModelCatalogEntry(provider, runtimeApi, runtimeConfig.websiteUrl, model),
      ),
    );

    if (models.length > 0) {
      catalog[provider] = models;
    }
  }

  return catalog;
};

export const modelCatalog = buildModelCatalog();

export const getCatalogProviders = () => Object.keys(modelCatalog);

export const getCatalogModels = (provider: string) => {
  return modelCatalog[provider] ?? [];
};

export const getCatalogModel = (
  provider: string,
  modelId: string,
  apiFormat?: string,
): RuntimeModelCatalogEntry | undefined => {
  return modelCatalog[provider]?.find((model) =>
    model.id === modelId && (!apiFormat || model.apiFormat === apiFormat),
  );
};
