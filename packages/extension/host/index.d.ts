import type { ExtensionManifest, ExtensionSource, JsonObject } from "@isle/extension-sdk";

export interface ExtensionPackageRegistration {
  path: string;
  enabled?: boolean;
  config?: JsonObject;
  toolRisks?: ExtensionSource["toolRisks"];
  commandRisks?: ExtensionSource["commandRisks"];
}
export interface ExtensionPackageRecord extends ExtensionPackageRegistration {
  id: string;
  enabled: boolean;
}
export interface ExtensionPackageCatalogRecord extends ExtensionPackageRecord {
  source: "bundled" | "local";
}
export interface ExtensionPackageManagerOptions {
  bundledPath?: string;
}
export interface ExtensionPackage {
  root: string;
  modules: ExtensionManifest["modules"];
  manifest: ExtensionManifest;
  packageJson: {
    name: string;
    version: string;
    type: "module";
    "isle.extension": ExtensionManifest;
    [key: string]: unknown;
  };
}
export function resolveExtensionConfig(manifest: ExtensionManifest, input?: JsonObject): JsonObject;
export function readExtensionPackage(
  path: string,
  options?: { checkEntry?: boolean; module?: "agent" | "ui" },
): ExtensionPackage;
export function resolveExtensionPackages(packages: readonly ExtensionPackageRegistration[]): ExtensionSource[];
export function readExtensionSettings(path: string): {
  version: 1;
  packages: ExtensionPackageRecord[];
  bundled?: Record<string, Omit<ExtensionPackageRegistration, "path">>;
};
export function loadExtensionSettingsSources(
  path?: string,
  options?: ExtensionPackageManagerOptions,
): ExtensionSource[];
export function createExtensionPackageManager(
  settingsPath: string,
  options?: ExtensionPackageManagerOptions,
): {
  list(): ExtensionPackageCatalogRecord[];
  add(path: string, options?: Omit<ExtensionPackageRegistration, "path">): Promise<ExtensionPackageRecord>;
  configure(id: string, patch: Omit<ExtensionPackageRegistration, "path">): Promise<ExtensionPackageRecord>;
  remove(id: string): Promise<void>;
  resolve(): ExtensionSource[];
};
