import { MODEL_PROVIDER_CONFIG } from "../provider-config.js";
import { RAW_MODEL_CATALOG } from "./data.js";
import type {
  CatalogModel,
  RuntimeModelCatalog,
  RuntimeModelInputModality,
  RuntimeModelProviderSummary,
} from "../types.js";

type RawCatalogModel = Omit<CatalogModel, "input"> & {
  input: readonly RuntimeModelInputModality[];
};

type RawCatalogProvider = {
  /** Original provider API URL from models.dev, kept as reference metadata. */
  api: string;
  models: Record<string, RawCatalogModel>;
};

type RawModelCatalog = Record<string, RawCatalogProvider>;

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
): RuntimeModelProviderSummary | null => {
  const catalogConfig = MODEL_PROVIDER_CONFIG[provider];
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

const buildModelCatalog = (): RuntimeModelCatalog => {
  const catalog: RuntimeModelCatalog = {};

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

export const BUILT_IN_MODEL_CATALOG = buildModelCatalog();
