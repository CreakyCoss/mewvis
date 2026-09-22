import type { UIContribution } from "@isle/extension-sdk/ui";
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
  modules: string[];
  capabilities: string[];
  config: Record<string, unknown>;
  configSchema: ExtensionSchema | null;
  error: string | null;
};

export const listExtensions = () => invokeNode<DesktopExtension[]>("list_extensions", { input: {} });
const mutate = (command: string, input: Record<string, unknown>) => invokeNode<DesktopExtension[]>(command, { input });
export const addExtension = (path: string) => mutate("add_extension", { path });
export const configureExtension = (id: string, patch: { enabled?: boolean; config?: Record<string, unknown> }) =>
  mutate("configure_extension", { id, ...patch });
export const removeExtension = (id: string) => mutate("remove_extension", { id });

export type ExtensionUIContribution = UIContribution & {
  extensionId: string;
  revision: string;
};
export type ExtensionView = {
  token: string;
  source: string;
  id: string;
  contributionId: string;
  viewId: string;
  config: Record<string, unknown>;
};
export const listExtensionUIContributions = () =>
  invokeNode<ExtensionUIContribution[]>("list_extension_ui_contributions", { input: {} });
export const openExtensionView = (input: {
  id: string;
  contributionId: string;
  viewId: string;
  workspacePath: string;
  chatId: string;
}) => invokeNode<ExtensionView>("open_extension_view", { input });
export const queryExtensionView = (token: string, method: "session.read") =>
  invokeNode<unknown>("query_extension_view", { input: { token, method } });
export const closeExtensionView = (token: string) => invokeNode<void>("close_extension_view", { input: { token } });
