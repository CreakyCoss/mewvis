export type PluginPermission =
  | "network"
  | "plugin-data"
  | "workspace-files"
  | "open-external"
  | "process"
  | "chat"
  | "chat-knowledge";
export interface PluginConfig {
  displayName: string;
  permissions: PluginPermission[];
  defaultEnabled?: boolean;
  /** Defaults to ./main/App.tsx. false creates a host-only plugin. */
  ui?:
    false | { entry?: string; title?: string; layout?: "contained" | "full" };
  /** Optional module exporting a default array of SDK tool definitions. */
  host?: { tools: string };
}
export declare function defineConfig(config: PluginConfig): PluginConfig;
