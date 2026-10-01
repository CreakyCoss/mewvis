import type { IsleApplicationContext } from "@isle/app-sdk";
import type { ApplicationChatClient } from "@isle/app-sdk/chat";
import {
  createApplicationDataClient,
  getApplicationDataClient,
  type ApplicationDataRequest,
  type ApplicationDataTransport,
  type ApplicationStorageValue,
  type ApplicationWorkspace,
} from "@isle/app-sdk/data";

const transport: ApplicationDataTransport = {
  version: 1,
  request: async () => ({ ok: true, value: null }),
};
const client = createApplicationDataClient(transport);
void getApplicationDataClient;

function chatUsesRegisteredWorkspace(
  chat: ApplicationChatClient,
  workspace: ApplicationWorkspace,
) {
  void chat.listSessions({ workspaceId: workspace.id });
  // @ts-expect-error Workspace discovery is available only through the data SDK.
  chat.listWorkspaces();
}
void chatUsesRegisteredWorkspace;

async function example(ctx: IsleApplicationContext) {
  if (!ctx.storage || !ctx.workspaces) return;
  const created = await ctx.workspaces.create({ name: "小说 A" });
  if (created) await ctx.storage.setItem("activeWorkspaceId", created.id);
  const id = await ctx.storage.getItem<string>("activeWorkspaceId");
  if (id) {
    const workspace: ApplicationWorkspace = await ctx.workspaces.get(id);
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
  const value: ApplicationStorageValue | null = await client.storage.getItem("any");
  void value;

  // @ts-expect-error Backend-specific querying is not part of the public storage contract.
  client.storage.query("SELECT * FROM workspaces");
  // @ts-expect-error Workspace-scoped business storage is intentionally not provided.
  created?.storage;
  // @ts-expect-error A directory descriptor is not a file API.
  created?.files;
  // @ts-expect-error Applications cannot assert that the user approved sharing.
  await client.workspaces.create({ name: "Novel", approved: true });
  const request: ApplicationDataRequest = {
    version: 1,
    method: "storage.clear",
    // @ts-expect-error Application identity belongs to the authenticated connection.
    applicationId: "other",
  };
  void request;
  // @ts-expect-error undefined is not a JSON storage value.
  await client.storage.setItem("key", undefined);
  // @ts-expect-error create may be cancelled by the user.
  const required: ApplicationWorkspace = await client.workspaces.create({
    name: "Novel",
  });
  void required;
}
void example;
