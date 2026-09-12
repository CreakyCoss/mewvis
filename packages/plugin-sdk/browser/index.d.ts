export interface PluginHostInfo {
  plugin: { id: string; name: string; version: string };
  theme: "light" | "dark";
  tools: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[];
}
export interface PluginToolResult<T = unknown> {
  value: T;
  content: unknown[];
  meta: unknown;
}
export interface PluginBrowserHost {
  readonly version: 1;
  /** Optional authenticated data v1 transport. Older hosts omit this capability. */
  readonly data?: import("../data/index.js").PluginDataTransport;
  /** Only tools owned by this plugin can be invoked. Result types are caller supplied. */
  executeTool<T = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<PluginToolResult<T>>;
  getHost(): PluginHostInfo | null;
  openExternal(url: string): Promise<{ opened: boolean }>;
}
export declare function getPluginHost(): PluginBrowserHost;
