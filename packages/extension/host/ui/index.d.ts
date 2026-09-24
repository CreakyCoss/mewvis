import type { UIContribution } from "./protocol/contracts.js";

/** UI module: typed contributions and scoped browser views. */
export interface UIModuleManifest {
  /** Required when a contribution references a browser view. */
  entry?: string;
  contributions: UIContribution[];
}

export * from "./protocol/contracts.js";
export * from "./protocol/browser.js";
