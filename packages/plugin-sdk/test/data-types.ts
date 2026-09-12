import type { IslePluginContext } from "@isle/plugin-sdk";
import type { PluginBrowserHost } from "@isle/plugin-sdk/browser";
import type { PluginChatClient } from "@isle/plugin-sdk/chat";
import {
  createPluginDataClient,
  getPluginDataClient,
  type PluginDataRequest,
  type PluginDataTransport,
  type PluginStorageValue,
  type PluginWorkspace,
} from "@isle/plugin-sdk/data";

const transport: PluginDataTransport = {
  version: 1,
  request: async () => ({ ok: true, value: null }),
};
const client = createPluginDataClient(transport);
const browser: PluginBrowserHost["data"] = transport;
void browser;
void getPluginDataClient;

function chatUsesRegisteredWorkspace(
  chat: PluginChatClient,
  workspace: PluginWorkspace,
) {
  void chat.listSessions({ workspaceId: workspace.id });
  // @ts-expect-error Workspace discovery is available only through the data SDK.
  chat.listWorkspaces();
}
void chatUsesRegisteredWorkspace;

async function example(ctx: IslePluginContext) {
  if (!ctx.storage || !ctx.workspaces) return;
  const created = await ctx.workspaces.create({ name: "小说 A" });
  if (created) await ctx.storage.setItem("activeWorkspaceId", created.id);
  const id = await ctx.storage.getItem<string>("activeWorkspaceId");
  if (id) {
    const workspace: PluginWorkspace = await ctx.workspaces.get(id);
    const path: string = workspace.path;
    void path;
  }
  await client.storage.setItem("editor", {
    cursor: 12,
    tags: ["novel"],
    enabled: true,
  });
  await client.storage.setItem("preset", { tags: ["novel", "draft"] } as const);
  const editor = await client.storage.getItem<{ cursor: number }>("editor");
  const cursor: number | undefined = editor?.cursor;
  void cursor;
  const value: PluginStorageValue | null = await client.storage.getItem("any");
  void value;

  // @ts-expect-error Backend-specific querying is not part of the public storage contract.
  client.storage.query("SELECT * FROM workspaces");
  // @ts-expect-error Workspace-scoped business storage is intentionally not provided.
  created?.storage;
  // @ts-expect-error A directory descriptor is not a file API.
  created?.files;
  // @ts-expect-error Plugins cannot assert that the user approved sharing.
  await client.workspaces.create({ name: "Novel", approved: true });
  const request: PluginDataRequest = {
    version: 1,
    method: "storage.clear",
    // @ts-expect-error Plugin identity belongs to the authenticated connection.
    pluginId: "other",
  };
  void request;
  // @ts-expect-error undefined is not a JSON storage value.
  await client.storage.setItem("key", undefined);
  // @ts-expect-error create may be cancelled by the user.
  const required: PluginWorkspace = await client.workspaces.create({
    name: "Novel",
  });
  void required;
}
void example;
