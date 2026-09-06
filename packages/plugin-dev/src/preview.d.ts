import type { ComponentType } from "react";
import type { PluginConfig } from "@isle/plugin-dev";
export declare function mountPreview(
  App: ComponentType,
  options: Pick<PluginConfig, "displayName" | "permissions"> & {
    name: string;
    version?: string;
    /** Omit for static previews on an existing server; Node tool calls then report unavailable. */
    endpoint?: string;
    token?: string;
    tools?: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }[];
  },
): Promise<() => void>;
