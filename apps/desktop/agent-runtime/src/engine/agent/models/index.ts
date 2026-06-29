import { BUILT_IN_MODEL_CATALOG } from "./built-in-catalog/index.js";
import type { ModelCatalog } from "./types.js";

export const MODEL_CATALOG: ModelCatalog = BUILT_IN_MODEL_CATALOG;

export type {
  CatalogModel,
} from "./types.js";
