import type { AgentAccess } from "@isle/chat-contracts";
export type {
  AgentAccess,
  AgentAccessPath,
  AgentAccessBase,
} from "@isle/chat-contracts";

export type ApplicationPermission =
  | "network"
  | "application-data"
  | "application-workspaces"
  | "workspace-files"
  | "open-external"
  | "process"
  | "chat"
  | "chat-knowledge"
  | "embedded-views";
export interface ApplicationConfig {
  displayName: string;
  permissions: ApplicationPermission[];
  /** Hard ceiling for Agent operations. Omitted capabilities are denied, including in full mode. */
  agentAccess?: AgentAccess;
  defaultEnabled?: boolean;
  /** Defaults to ./main/App.tsx. false creates a host-only application. */
  ui?:
    | false
    | {
        entry?: string;
        title?: string;
      };
  /** Default arrays, or a full SDK application entry that can capture the application context. */
  host?: {
    entry?: string;
    tools?: string;
    skills?: string;
  };
}
export declare function defineConfig(config: ApplicationConfig): ApplicationConfig;
