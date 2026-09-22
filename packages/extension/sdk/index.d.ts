/** Isle plugin protocol overview. Capability guide: docs/extensions/sdk.md. */
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
  schemaVersion: 2;
  id: string;
  apiVersion: 1;
  modules: ExtensionModules;
  configuration?: ExtensionConfiguration;
}

export type * from "./shared.js";
export * from "./agent/index.js";
export * from "./ui/index.js";
export * from "./host/index.js";
