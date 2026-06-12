import { PROVIDER_CATALOG_CONFIG } from "./config";
import { RAW_MODEL_CATALOG } from "./data";
import type {
  CatalogModel,
  CatalogProvider,
  ModelCatalog,
  RawCatalogModel,
  RawCatalogProvider,
  RawModelCatalog,
} from "./types";

const rawModelCatalog = RAW_MODEL_CATALOG satisfies RawModelCatalog;

const toCatalogModel = (model: RawCatalogModel): CatalogModel => ({
  ...model,
  input: [...model.input],
});

const buildCatalogModelMap = (
  rawModels: Record<string, RawCatalogModel>,
  modelIds?: string[],
) => {
  const models: Record<string, CatalogModel> = {};

  for (const modelId of modelIds ?? Object.keys(rawModels)) {
    const rawModel = rawModels[modelId];
    if (!rawModel) continue;

    models[modelId] = toCatalogModel(rawModel);
  }

  return models;
};

const buildCatalogProvider = (
  provider: string,
  rawProviderCatalog: RawCatalogProvider,
): CatalogProvider | null => {
  const catalogConfig = PROVIDER_CATALOG_CONFIG[provider];
  if (!catalogConfig) return null;

  const models = buildCatalogModelMap(
    rawProviderCatalog.models,
    catalogConfig.models,
  );

  if (Object.keys(models).length === 0) {
    return null;
  }

  return {
    models,
    websiteUrl: catalogConfig.websiteUrl,
    apis: catalogConfig.apis.map((api) => ({ ...api })),
  };
};

const buildModelCatalog = (): ModelCatalog => {
  const catalog: ModelCatalog = {};

  for (const [provider, rawProviderCatalog] of Object.entries(rawModelCatalog)) {
    const providerCatalog = buildCatalogProvider(
      provider,
      rawProviderCatalog,
    );
    if (!providerCatalog) continue;

    catalog[provider] = providerCatalog;
  }

  return catalog;
};

export const MODEL_CATALOG = buildModelCatalog();
