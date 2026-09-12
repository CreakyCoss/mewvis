export interface ApplicationHostInfo {
  application: { id: string; name: string; version: string };
  theme: "light" | "dark";
  tools: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[];
}
export interface ApplicationToolResult<T = unknown> {
  value: T;
  content: unknown[];
  meta: unknown;
}
export interface ApplicationBrowserHost {
  readonly version: 1;
  /** Optional authenticated data v1 transport. Older hosts omit this capability. */
  readonly data?: import("../data/index.js").ApplicationDataTransport;
  /** Only this application's tools enabled by the user can be invoked. Result types are caller supplied. */
  executeTool<T = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<ApplicationToolResult<T>>;
  getHost(): ApplicationHostInfo | null;
  openExternal(url: string): Promise<{ opened: boolean }>;
}
export declare function getApplicationHost(): ApplicationBrowserHost;
