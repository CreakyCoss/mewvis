import { invoke, isTauri } from "@tauri-apps/api/core";

export type PluginRuntimeKind = "isle" | "dsh";

export type PluginPermission =
  "network" | "plugin-data" | "workspace-files" | "open-external" | "process" | "chat" | "chat-knowledge";
export type PluginPermissionStatus = "declared" | "isle-upgrade-required" | "dsh-unsupported";

export type PluginDescriptor = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: "bundled" | "installed";
  enabled: boolean;
  defaultEnabled: boolean;
  path: string;
  runtimeKind: PluginRuntimeKind;
  entry: string;
  compatibility: PluginCompatibility[];
  permissions: PluginPermission[];
  permissionStatus: PluginPermissionStatus;
  origin: PluginOrigin | null;
};

export type PluginCompatibility = {
  adapter: string;
};

export type PluginOrigin = {
  kind: "marketplace";
  marketplace: string;
  fullName: string;
  package: string;
  repoUrl: string;
};

export type MarketplacePlugin = {
  fullName: string;
  name: string;
  owner: string;
  summary: string;
  summaryZh: string;
  category: string;
  language: string;
  license: string;
  stars: number;
  pushedAt: string;
  repoUrl: string;
  npmPackage: string | null;
  installable: boolean;
  installCheck: "passed" | "needs-approval" | "not-a-layer" | "failed" | "timeout" | null;
  blockedBuilds: string[];
  riskFlags: string[];
  inRegistry: boolean;
  url: string;
};

export type MarketplaceSearchResult = {
  total: number;
  count: number;
  results: MarketplacePlugin[];
};

export type PluginMarketplaceProviderId = "dsh-community";

export type RemovedPlugin = {
  id: string;
  path: string;
};

export type PluginUiTool = {
  name: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
};

export type PluginUiPlugin = {
  runtimeKind: PluginRuntimeKind;
  id: string;
  name: string;
  version: string;
  description: string;
  source: "bundled" | "installed";
  tools: PluginUiTool[];
  error: string | null;
  ui: { kind: "sandbox"; title?: string; layout?: "contained" | "full" } | null;
  uiError: string | null;
  compatibility: { adapter: string; clientPlatform?: string | null }[];
  permissions: PluginPermission[];
  permissionStatus: PluginPermissionStatus;
};

export type PluginUiCatalog = {
  plugins: PluginUiPlugin[];
};

export type PluginUiToolResult = {
  value: unknown;
  content: unknown[];
  meta: unknown;
};

export type PluginUiDocument = {
  script: string;
  style: string;
};

export async function listPlugins() {
  if (!isTauri()) return [] satisfies PluginDescriptor[];
  return invoke<PluginDescriptor[]>("list_plugins");
}

export async function installPlugin(sourcePath: string, enable = false) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持安装插件");
  return invoke<PluginDescriptor>("install_plugin", {
    input: { sourcePath, enable },
  });
}

export async function inspectPlugin(sourcePath: string) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持检查插件");
  return invoke<PluginDescriptor>("inspect_plugin", {
    input: { sourcePath },
  });
}

export async function searchPluginMarketplace(
  provider: PluginMarketplaceProviderId,
  query: string,
  page = 1,
  limit = 20,
) {
  if (!isTauri()) return { total: 0, count: 0, results: [] } satisfies MarketplaceSearchResult;
  return invoke<MarketplaceSearchResult>("search_plugin_marketplace", {
    input: { provider, query, page, limit },
  });
}

export async function installPluginFromMarketplace(provider: PluginMarketplaceProviderId, plugin: MarketplacePlugin) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持安装插件");
  if (!plugin.npmPackage) throw new Error("该条目没有可安全下载的 npm 发布包");
  return invoke<PluginDescriptor>("install_plugin_from_marketplace", {
    input: {
      provider,
      fullName: plugin.fullName,
      npmPackage: plugin.npmPackage,
      repoUrl: plugin.repoUrl,
    },
  });
}

export async function setPluginEnabled(id: string, enabled: boolean) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持修改插件状态");
  return invoke<PluginDescriptor>("set_plugin_enabled", {
    input: { id, enabled },
  });
}

export async function removePlugin(id: string) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持移除插件");
  return invoke<RemovedPlugin>("remove_plugin", {
    input: { id },
  });
}

export async function listPluginUi() {
  if (!isTauri()) return { plugins: [] } satisfies PluginUiCatalog;
  return invoke<PluginUiCatalog>("list_plugin_ui");
}

export async function executePluginUiTool(pluginId: string, toolName: string, args: unknown = {}) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持插件工具调用");
  return invoke<PluginUiToolResult>("execute_plugin_ui_tool", {
    input: { pluginId, toolName, arguments: args },
  });
}

export async function getPluginUiDocument(pluginId: string) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持插件沙箱 UI");
  return invoke<PluginUiDocument>("get_plugin_ui_document", {
    input: { pluginId },
  });
}
