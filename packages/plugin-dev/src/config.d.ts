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
  /** Optional modules exporting default arrays of SDK definitions. */
  host?: {
    tools?: string;
    skills?: string;
  };
}
export declare function defineConfig(config: PluginConfig): PluginConfig;
