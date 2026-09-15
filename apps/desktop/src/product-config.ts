import productConfig from "../../product.config.json";

export const PRODUCT_CONFIG = productConfig;

export const APP_DISPLAY_NAME = PRODUCT_CONFIG.displayName;
export const APP_DATA_DIR_NAME = PRODUCT_CONFIG.appDataDirName;
export const DEFAULT_WORKSPACE_DIR_NAME = PRODUCT_CONFIG.defaultWorkspaceDirName;

export const appStorageKey = (name: string) => `${PRODUCT_CONFIG.storageKeyPrefix}:${name}`;
