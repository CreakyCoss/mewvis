import type { ComponentType } from "react";
import type { ApplicationConfig } from "@isle/app-dev";
import type { IsleToolRisk } from "@isle/app-sdk";
export declare function mountPreview(
  App: ComponentType,
  options: Pick<ApplicationConfig, "displayName" | "permissions"> & {
    name: string;
    version?: string;
    /** Omit for static previews on an existing server; Node tool calls then report unavailable. */
    endpoint?: string;
    token?: string;
    tools?: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      risk?: IsleToolRisk;
    }[];
    /** Serialized host definitions for static previews; never import host modules into UI. */
    skills?: { name: string; description: string; content: string }[];
  },
): Promise<() => void>;
