import { invokeNode } from "@/transport/http";

export type ExtensionSchema = Record<string, unknown> & {
  properties?: Record<string, ExtensionSchema>;
  required?: string[];
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
};
export type DesktopExtension = {
  id: string;
  source: "bundled" | "local";
  path: string;
  enabled: boolean;
  version: string | null;
  description: string;
  capabilities: string[];
  config: Record<string, unknown>;
  configSchema: ExtensionSchema | null;
  error: string | null;
};
export type ExtensionCommand = { id: string; description: string; parameters: ExtensionSchema };
export type { ExtensionCommandTarget } from "@/agent-client/contracts/tauri";
export { listExtensionCommands, executeExtensionCommand } from "./agent-runtime";

export const listExtensions = () => invokeNode<DesktopExtension[]>("list_extensions", { input: {} });
const mutate = (command: string, input: Record<string, unknown>) => invokeNode<DesktopExtension[]>(command, { input });
export const addExtension = (path: string) => mutate("add_extension", { path });
export const configureExtension = (id: string, patch: { enabled?: boolean; config?: Record<string, unknown> }) =>
  mutate("configure_extension", { id, ...patch });
export const removeExtension = (id: string) => mutate("remove_extension", { id });
