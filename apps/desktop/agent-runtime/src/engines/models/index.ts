import { BUILT_IN_MODEL_CATALOG } from "./built-in-catalog/index.js";
import type { RuntimeModelCatalog } from "../protocol/wire.js";

export const MODEL_CATALOG: RuntimeModelCatalog = BUILT_IN_MODEL_CATALOG;
