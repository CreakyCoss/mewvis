import { createDesktopChatService } from "@/chat/desktop";
import type { DesktopSessionInput } from "@/chat/desktop";
import { loadStoryById } from "@/features/pages/stories/storage";
import { prepareStoryChatProfile } from "@/features/pages/stories/story/actions/assistant/resources";
import { listPlugins } from "@/api/plugins";
import { createPluginChatHost } from "@/chat/desktop/plugin";
import { listPluginTools } from "@/api/plugin-tools";
import { resolvePluginChatWorkspace } from "./plugin-chat-workspace";

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
  return plugin;
}
export const pluginChatHost = createPluginChatHost(chatService, {
  async toolCatalog(pluginId) {
    await requirePlugin(pluginId);
    return listPluginTools(pluginId);
  },
  async authorize(pluginId, workspaceId) {
    const plugin = await requirePlugin(pluginId);
    const workspacePath = await resolvePluginChatWorkspace(plugin, workspaceId);
    return { workspacePath, knowledge: plugin.permissions.includes("chat-knowledge") };
  },
});
