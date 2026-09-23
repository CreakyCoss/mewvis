import type { UIContribution } from "./protocol/contracts.js";

/** UI module: text/sidebar contributions and scoped session data access. */
export interface UIModuleManifest {
  /** Required for sidebar views; plain text contributions need no executable entry. */
  entry?: string;
  contributions: UIContribution[];
}

export * from "./protocol/contracts.js";
export * from "./protocol/browser.js";
