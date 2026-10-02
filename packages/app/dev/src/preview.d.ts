import type { ComponentType } from "react";
import type { ApplicationConfig } from "@mewvis/app-dev";
import type { MewvisToolRisk } from "@mewvis/app-sdk";
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
      risk?: MewvisToolRisk;
    }[];
    /** Serialized host definitions for static previews; never import host modules into UI. */
    skills?: { name: string; description: string; content: string }[];
  },
): Promise<() => void>;
