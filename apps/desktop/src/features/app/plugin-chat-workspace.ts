import { createPluginDataClient, PluginDataError } from "@isle/plugin-sdk/data";
import { createDesktopPluginDataTransport } from "@/api/plugin-data";
import type { PluginPermission } from "@/api/plugins";

/** Resolve a directory for Chat without enrolling it in the desktop workspace registry. */
export async function resolvePluginChatWorkspace(
  plugin: { id: string; permissions: PluginPermission[] },
  workspaceId: string,
): Promise<string> {
  if (!plugin.permissions.includes("plugin-workspaces")) {
    throw new PluginDataError("PERMISSION_DENIED", "插件未声明 plugin-workspaces 权限");
  }
  const transport = createDesktopPluginDataTransport(plugin.id);
  try {
    return (await createPluginDataClient(transport).workspaces.get(workspaceId)).path;
  } finally {
    transport.dispose();
  }
}
