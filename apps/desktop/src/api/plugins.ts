import { invoke, isTauri } from "@tauri-apps/api/core";

export type DshPluginDescriptor = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: "bundled" | "installed";
  enabled: boolean;
  defaultEnabled: boolean;
  path: string;
  specifier: string;
  dshPatch: string;
  origin: DshPluginOrigin | null;
};

export type DshPluginOrigin = {
  kind: "marketplace";
  marketplace: string;
  fullName: string;
  package: string;
  repoUrl: string;
};

export type DshMarketplacePlugin = {
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

export type DshMarketplaceSearchResult = {
  total: number;
  count: number;
  results: DshMarketplacePlugin[];
};

export type RemovedDshPlugin = {
  id: string;
  path: string;
};

export type DshPluginUiTool = {
  name: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
};

export type DshPluginUiPlugin = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: "bundled" | "installed";
  tools: DshPluginUiTool[];
  error: string | null;
  ui: { kind: "sandbox"; title?: string; layout?: "contained" | "full" } | null;
  uiError: string | null;
  dshClient: { declared: true; platform: string | null } | null;
};

export type DshPluginUiCatalog = {
  plugins: DshPluginUiPlugin[];
};

export type DshPluginUiToolResult = {
  value: unknown;
  content: unknown[];
  meta: unknown;
};

export type DshPluginUiDocument = {
  script: string;
  style: string;
};

export async function listDshPlugins() {
  if (!isTauri()) return [] satisfies DshPluginDescriptor[];
  return invoke<DshPluginDescriptor[]>("list_dsh_plugins");
}

export async function installDshPlugin(sourcePath: string, enable = true) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持安装插件");
  return invoke<DshPluginDescriptor>("install_dsh_plugin", {
    input: { sourcePath, enable },
  });
}

export async function searchDshPluginMarketplace(query: string, page = 1, limit = 20) {
  if (!isTauri()) return { total: 0, count: 0, results: [] } satisfies DshMarketplaceSearchResult;
  return invoke<DshMarketplaceSearchResult>("search_dsh_plugin_marketplace", {
    input: { query, page, limit },
  });
}

export async function installDshPluginFromMarketplace(plugin: DshMarketplacePlugin, enable = false) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持安装插件");
  if (!plugin.npmPackage) throw new Error("该条目没有可安全下载的 npm 发布包");
  return invoke<DshPluginDescriptor>("install_dsh_plugin_from_marketplace", {
    input: {
      fullName: plugin.fullName,
      npmPackage: plugin.npmPackage,
      repoUrl: plugin.repoUrl,
      enable,
    },
  });
}

export async function setDshPluginEnabled(id: string, enabled: boolean) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持修改插件状态");
  return invoke<DshPluginDescriptor>("set_dsh_plugin_enabled", {
    input: { id, enabled },
  });
}

export async function removeDshPlugin(id: string) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持移除插件");
  return invoke<RemovedDshPlugin>("remove_dsh_plugin", {
    input: { id },
  });
}

export async function listDshPluginUi() {
  if (!isTauri()) return { plugins: [] } satisfies DshPluginUiCatalog;
  return invoke<DshPluginUiCatalog>("list_dsh_plugin_ui");
}

export async function executeDshPluginUiTool(pluginId: string, toolName: string, args: unknown = {}) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持插件工具调用");
  return invoke<DshPluginUiToolResult>("execute_dsh_plugin_ui_tool", {
    input: { pluginId, toolName, arguments: args },
  });
}

export async function getDshPluginUiDocument(pluginId: string) {
  if (!isTauri()) throw new Error("Web 预览模式暂不支持插件沙箱 UI");
  return invoke<DshPluginUiDocument>("get_dsh_plugin_ui_document", {
    input: { pluginId },
  });
}
