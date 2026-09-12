import type { IsleToolRisk } from "../index.js";
import type { ApplicationChatClient } from "../chat/index.js";

/** A tool name grant does not grant filesystem, network or process access. */
export type ApplicationTool = Readonly<{
  name: string;
  label: string;
  description: string;
  source: "host" | "application";
  /** Absent for tools without a declaration; host file tools are assessed from their actual arguments. */
  risk?: IsleToolRisk;
  enabled: boolean;
}>;

export interface ApplicationToolClient {
  /** Host tools and this application's tools, with the latest user selection. Requires chat permission. */
  list(): Promise<ApplicationTool[]>;
}

/** Native applications can pass context.chat. This API never changes user grants. */
export declare function createApplicationToolClient(
  chat: Pick<ApplicationChatClient, "listTools">,
): ApplicationToolClient;
export declare function getApplicationToolClient(): ApplicationToolClient;
