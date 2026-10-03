import type { ApplicationViewHost, ApplicationViewTheme } from "./index.js";
export declare const applicationViewIdentity: Readonly<{
  channel: string;
  readyEvent: string;
  themeEvent: string;
  globalName: string;
}>;
/** Host infrastructure shared by production and development preview. */
export declare function createApplicationViewHost(options: {
  getTheme(): ApplicationViewTheme | null;
  identity?: typeof applicationViewIdentity;
}): ApplicationViewHost;
