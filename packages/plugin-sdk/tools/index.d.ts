/** A tool name grant does not grant filesystem, network or process access. */
export type PluginTool = Readonly<{
  name: string;
  label: string;
  description: string;
  source: "host" | "plugin";
  enabled: boolean;
}>;

export interface PluginToolClient {
  /** Host tools and this plugin's tools, with the latest user selection. Requires chat permission. */
  list(): Promise<PluginTool[]>;
}

/** Native plugins can pass context.chat. This API never changes user grants. */
export declare function createPluginToolClient(
  chat: Pick<import("../chat/index.js").PluginChatClient, "listTools">,
): PluginToolClient;
export declare function getPluginToolClient(): PluginToolClient;
