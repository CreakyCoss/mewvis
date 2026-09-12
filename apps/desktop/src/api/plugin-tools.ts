import { invoke, isTauri } from "@tauri-apps/api/core";
import type { PluginTool } from "@isle/plugin-sdk/tools";
import { listAgentRuntimeTools } from "@/api/agent-runtime";
import { listPluginUi } from "@/api/plugins";

export type PluginToolPolicy = { allowedToolNames: string[] };

export async function listPluginTools(pluginId: string): Promise<PluginTool[]> {
  if (!isTauri()) throw new Error("当前宿主不支持插件工具授权");
  const [runtime, catalog, policy] = await Promise.all([
    listAgentRuntimeTools(),
    listPluginUi(),
    invoke<PluginToolPolicy | null>("get_plugin_tool_policy", { pluginId }),
  ]);
  const plugin = catalog.plugins.find((item) => item.id === pluginId);
  if (!plugin || plugin.error) throw new Error("插件工具加载失败，请重新启用插件后重试");
  const all = [
    ...runtime.tools.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description ?? "",
      source: "host" as const,
    })),
    ...plugin.tools.map((tool) => ({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      source: "plugin" as const,
      risk: tool.risk,
    })),
  ];
  if (new Set(all.map((tool) => tool.name)).size !== all.length) throw new Error("插件工具不能与宿主工具重名");
  return all.map((tool) => ({ ...tool, enabled: policy === null || policy.allowedToolNames.includes(tool.name) }));
}

/** Only the trusted management UI calls this; it is never exposed on the plugin bridge. */
export async function savePluginToolPolicy(pluginId: string, allowedToolNames: string[]): Promise<void> {
  await invoke("set_plugin_tool_policy", { pluginId, policy: { allowedToolNames: [...new Set(allowedToolNames)] } });
}
