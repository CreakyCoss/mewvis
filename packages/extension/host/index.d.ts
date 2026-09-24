/** Native host plugin protocol. Independent of any external SDK or concrete Agent. */
import type { ExtensionHostRequirements } from "./services/contracts.js";
import type { JsonObject } from "./shared.js";
import type { AgentModuleManifest } from "./agent/index.js";
import type { UIModuleManifest } from "./ui/index.js";

/** Optional plugin domains. Each module is loaded by its own host. */
export interface ExtensionModules {
  /** Tools, skills, commands, session state, events and execution middleware. */
  agent?: AgentModuleManifest;
  /** Text/sidebar slot contributions and scoped session data access. */
  ui?: UIModuleManifest;
}

export interface ExtensionConfiguration {
  schema: JsonObject;
  defaults?: JsonObject;
}

/** Package shape is independent of the API version of each runtime entry. */
export interface ExtensionManifest {
  schemaVersion: 1;
  id: string;
  /** Human-readable name shown in plugin management. */
  displayName?: string;
  protocolVersion: 1;
  modules: ExtensionModules;
  /** Host services required or optionally consumed by this package. Not an executable module. */
  host?: ExtensionHostRequirements;
  configuration?: ExtensionConfiguration;
}

export type * from "./shared.js";
export * from "./agent/index.js";
export * from "./ui/index.js";
export * from "./services/contracts.js";

/** Module entries are native plugins; package manifests compose optional agent/UI entries. */
export function definePlugin(
  plugin: import("./agent/index.js").ExtensionDefinition,
): import("./agent/index.js").ExtensionDefinition;
export function definePlugin(
  plugin: import("./ui/protocol/browser.js").ExtensionUIDefinition,
): import("./ui/protocol/browser.js").ExtensionUIDefinition;
