import { listPlugins, listPluginUi } from "@/api/plugins";
import { listWorkspaces } from "@/api/workspace";
import { createPluginChatHost } from "@/chat/desktop/plugin";
import { chatService } from "./chat-service";

async function requirePlugin(pluginId: string) {
  const plugins = await listPlugins();
  const plugin = plugins.find((plugin) => plugin.id === pluginId && plugin.enabled);
  if (!plugin || plugin.permissionStatus !== "declared" || !plugin.permissions.includes("chat"))
    throw new Error("插件未启用或未获授权使用聊天");
  if (!plugin.permissions.includes("workspace-files")) throw new Error("插件未获授权访问工作区");
  return plugin;
}
export const pluginChatHost = createPluginChatHost(chatService, {
  async tools(pluginId) {
    await requirePlugin(pluginId);
    const catalog = await listPluginUi();
    const plugin = catalog.plugins.find((item) => item.id === pluginId);
    if (!plugin || plugin.error) throw new Error("插件能力加载失败，暂时无法恢复聊天");
    return plugin.tools.map((tool) => tool.name);
  },
  async workspaces(pluginId) {
    const [, workspaces] = await Promise.all([requirePlugin(pluginId), listWorkspaces()]);
    return workspaces.map(({ id, name, isDefault }) => ({ id, name, isDefault }));
  },
  async authorize(pluginId, workspaceId) {
    const [plugin, workspaces] = await Promise.all([requirePlugin(pluginId), listWorkspaces()]);
    const workspace = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!workspace) throw new Error("工作区不存在");
    return { workspacePath: workspace.path, knowledge: plugin.permissions.includes("chat-knowledge") };
  },
});
