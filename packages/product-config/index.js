import config from "./product.config.json" with { type: "json" };

const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

// The package snapshot is generated from apps/product.config.json so published
// tooling works without a checkout of the desktop application.
export const PRODUCT_CONFIG = freeze(config);
export const APP_DISPLAY_NAME = config.displayName;
export const APP_DATA_DIR_NAME = config.appDataDirName;
export const PRODUCT_NAMESPACE = config.namespace;
export const DEFAULT_WORKSPACE_DIR_NAME = config.defaultWorkspaceDirName;
export const productId = (suffix = "") => `${PRODUCT_NAMESPACE}${suffix}`;
export const productDataName = (suffix = "") => `${APP_DATA_DIR_NAME}${suffix}`;
export const envName = (suffix) => `${config.envPrefix}_${suffix}`;
export const appStorageKey = (name) => `${config.storageKeyPrefix}:${name}`;

export const PRODUCT_KEYS = Object.freeze({
  applicationManifest: productId(),
  extensionManifest: productId(".extension"),
  pluginManifest: productId(".plugin"),
  applicationGlobal: productId("Application"),
  applicationReactGlobal: productId("ApplicationReact"),
  applicationChatGlobal: productId("ApplicationChatUI"),
  embeddedViewGlobal: productId("EmbeddedView"),
  applicationSettings: `$${productId("ApplicationSettings")}`,
  hostSettings: `$${productId("Host")}`,
  runtimeCommand: `x-${productId("-command")}`,
  runtimeParamsSchema: `x-${productId("-params-schema")}`,
});
