import type { ExtensionUICatalogSource } from "@isle/extension-host/ui/react";
import type {
  ExtensionUIContribution,
  ExtensionViewInput,
  ExtensionViewLease,
  ExtensionViewTransport,
} from "@isle/extension-host/ui/transport";
import { invokeNode } from "@/transport/http";
import { listenNode, observeConnection } from "@/transport/events";

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

export const listExtensionUIContributions = () =>
  invokeNode<ExtensionUIContribution[]>("list_extension_ui_contributions", { input: {} });
export const openExtensionView = (input: ExtensionViewInput) =>
  invokeNode<ExtensionViewLease>("open_extension_view", { input });
export const queryExtensionView = (token: string, method: string, input: unknown, requestId: number) =>
  invokeNode<unknown>("query_extension_view", { input: { token, method, arguments: input, requestId } });
export const cancelExtensionViewRequest = (token: string, requestId: number) =>
  invokeNode<void>("cancel_extension_view_request", { input: { token, requestId } });
export const closeExtensionView = (token: string) => invokeNode<void>("close_extension_view", { input: { token } });

/** Bind application HTTP/events to the native UI host's ports. */
export const extensionUICatalog: ExtensionUICatalogSource = {
  list: listExtensionUIContributions,
  async subscribe(changed) {
    const disconnect = observeConnection(changed);
    try {
      const stop = await listenNode("extensions_changed", changed);
      return () => {
        disconnect();
        stop();
      };
    } catch (error) {
      disconnect();
      throw error;
    }
  },
};
export const extensionViewTransport: ExtensionViewTransport = {
  open: openExtensionView,
  close: closeExtensionView,
  query: queryExtensionView,
  cancel: cancelExtensionViewRequest,
};
