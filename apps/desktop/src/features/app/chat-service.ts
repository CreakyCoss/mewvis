import { createDesktopChatService } from "@/chat/desktop";
import type { DesktopSessionInput } from "@/chat/desktop";
import { loadStoryById } from "@/features/pages/stories/storage";
import { prepareStoryChatProfile } from "@/features/pages/stories/story/actions/assistant/resources";
import { listPlugins, listPluginUi } from "@/api/plugins";
import { listWorkspaces } from "@/api/workspace";
import { createPluginChatHost } from "@/chat/desktop/plugin";
import { listAgentRuntimeTools } from "@/api/agent-runtime";

// Owned by the application. Resolvers return scene configuration; the service owns sessions.
export const chatService = createDesktopChatService({
  async resolveRecord(workspacePath, chatId, value): Promise<DesktopSessionInput> {
    const source = value as { workspaceId: string; origin: { kind: string; sceneId: string } };
    if (source.origin.kind === "plugin") return pluginChatHost.resolveSession(workspacePath, chatId, value);
    if (source.origin.kind !== "builtin") throw new Error("聊天来源不可用");
    if (source.origin.sceneId === "story-assistant") {
      const story = await loadStoryById(source.workspaceId);
      if (!story || story.workspace.path !== workspacePath) throw new Error("故事场景不可用");
      return {
        identity: { scope: `workspace:${source.workspaceId}`, id: chatId },
        workspaceId: source.workspaceId,
        workspacePath,
        origin: { kind: "builtin", sceneId: "story-assistant" },
        profile: prepareStoryChatProfile(story),
      };
    }
    throw new Error("聊天场景不可用");
  },
});

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
    const [catalog, runtime] = await Promise.all([listPluginUi(), listAgentRuntimeTools()]);
    const plugin = catalog.plugins.find((item) => item.id === pluginId);
    if (!plugin || plugin.error) throw new Error("插件能力加载失败，暂时无法恢复聊天");
    return [
      ...new Set([
        ...runtime.tools.map((tool) => tool.name),
        ...catalog.plugins.filter((item) => !item.error).flatMap((item) => item.tools.map((tool) => tool.name)),
      ]),
    ];
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
