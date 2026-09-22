import type { UIContribution } from "./slots.js";
import type { ExtensionUIDefinition } from "./browser.js";

/** UI module: text/sidebar contributions and scoped session data access. */
export interface UIModuleManifest {
  /** Required for sidebar views; plain text contributions need no executable entry. */
  entry?: string;
  capabilities: ExtensionUICapability[];
  contributions: UIContribution[];
}
export type ExtensionUICapability = "session.read";

export function defineUIExtension(
  definition: ExtensionUIDefinition,
): ExtensionUIDefinition;

export * from "./slots.js";
export * from "./services.js";
export * from "./browser.js";
