import type { ApplicationViewHost, ApplicationViewTheme } from "./index.js";
/** Host infrastructure shared by production and development preview. */
export declare function createApplicationViewHost(options: {
  getTheme(): ApplicationViewTheme | null;
}): ApplicationViewHost;
