import type { AgentAccess } from "@isle/chat-contracts";
export type {
  AgentAccess,
  AgentAccessPath,
  AgentAccessBase,
} from "@isle/chat-contracts";

export type PluginPermission =
  | "network"
  | "plugin-data"
  | "plugin-workspaces"
  | "workspace-files"
  | "open-external"
  | "process"
  | "chat"
  | "chat-knowledge";
export interface PluginConfig {
  displayName: string;
  permissions: PluginPermission[];
  /** Hard ceiling for Agent operations. Omitted capabilities are denied, including in full mode. */
  agentAccess?: AgentAccess;
  defaultEnabled?: boolean;
  /** Defaults to ./main/App.tsx. false creates a host-only plugin. */
  ui?:
    | false
    | {
        entry?: string;
        title?: string;
        layout?: "contained" | "full" | "fullscreen";
      };
  /** Optional modules exporting default arrays of SDK definitions. */
  host?: {
    tools?: string;
    skills?: string;
  };
}
export declare function defineConfig(config: PluginConfig): PluginConfig;
