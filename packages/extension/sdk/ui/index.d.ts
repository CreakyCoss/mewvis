import type { UIContribution } from "./slots.js";
import type { ExtensionUIDefinition } from "./browser.js";

/** UI module: typed contributions and scoped browser views. */
export interface UIModuleManifest {
  /** Required when a contribution references a browser view. */
  entry?: string;
  contributions: UIContribution[];
}

export function defineUIExtension(
  definition: ExtensionUIDefinition,
): ExtensionUIDefinition;

export * from "./slots.js";
export * from "./browser.js";
