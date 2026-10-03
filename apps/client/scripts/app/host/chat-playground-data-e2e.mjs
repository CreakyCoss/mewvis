import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createApplicationChatClient } from "@mewvis/app-sdk/chat";
import { createApplicationDataClient } from "@mewvis/app-sdk/data";

// Real application Chat, SDK, directory resolver and playground preferences.
// Only native IO and model execution are replaced; no user files or models are touched.
const temp = mkdtempSync(join(tmpdir(), "mewvis-playground-data-"));
const applicationId = "@mewvis/chat-playground";
const permissions = ["chat", "workspace-files", "chat-knowledge", "application-workspaces", "application-data"];
const own = { id: "own", name: "应用目录", path: join(temp, "own"), isDefault: true };
const other = { id: "other", name: "其他应用", path: join(temp, "other"), isDefault: false };
const legacy = { id: "legacy", name: "宿主目录", path: join(temp, "legacy"), isDefault: true };
const state = {
  enabled: true,
  permissions: [...permissions],
  workspaces: [own],
  error: null,
  cancel: false,
  calls: [],
  policy: null,
};
let bundle;
const ok = (value) => ({ ok: true, value });
const denied = (code) => ({ ok: false, error: { code, message: code } });
const read = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const write = (file, value) => {
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
};
const chatFile = (path, id) => join(path, "chats", `${id}.json`);
const savedChats = new Map();
globalThis.__playgroundFixture = {
  applications: () => [
    { id: applicationId, enabled: state.enabled, permissions: state.permissions, permissionStatus: "declared" },
  ],
  workspaces: () => {
    throw new Error("应用不得读取宿主工作区注册表");
  },
  async invoke(command, args) {
    state.calls.push({ command, args });
    if (command === "get_application_tool_policy") return structuredClone(state.policy);
    if (command === "connect_application_data") {
      assert.equal(args.applicationId, applicationId);
      if (!state.enabled) throw denied("PERMISSION_DENIED");
      return "bound-playground";
    }
    if (command === "disconnect_application_data") return null;
    if (command === "request_application_data") {
      assert.equal(args.connection, "bound-playground");
      const { method, params } = args.request;
      const permission = method.startsWith("storage.") ? "application-data" : "application-workspaces";
      if (!state.enabled || !state.permissions.includes(permission)) return denied("PERMISSION_DENIED");
      if (method === "workspaces.list") return ok(structuredClone(state.workspaces));
      if (method === "workspaces.get") {
        if (state.error) return denied(state.error);
        return state.workspaces.some((item) => item.id === params.id)
          ? ok(structuredClone(state.workspaces.find((item) => item.id === params.id)))
          : denied("WORKSPACE_NOT_FOUND");
      }
      if (method === "workspaces.create") {
        if (state.cancel) return ok(null);
        const workspace = { id: "created", name: params.name, path: join(temp, "created"), isDefault: false };
        state.workspaces.push(workspace);
        mkdirSync(workspace.path, { recursive: true });
        return ok(workspace);
      }
      const file = join(temp, "business.json");
      const values = read(file, {});
      if (method === "storage.getItem") return ok(values[params.key] ?? null);
      if (method === "storage.setItem") {
        values[params.key] = params.value;
        write(file, values);
        return ok(null);
      }
      if (method === "storage.clear") {
        write(file, {});
        return ok(null);
      }
      throw new Error(`Unexpected data call: ${method}`);
    }
    if (command === "save_chat") {
      const input = args.input;
      const value = { ...input, id: input.chatId, createdAt: 1, updatedAt: Date.now() };
      const file = chatFile(input.workspacePath, input.chatId);
      write(file, value);
      savedChats.set(file, value);
      return value;
    }
    if (command === "load_chat") return read(chatFile(args.input.workspacePath, args.input.chatId), null);
    if (command === "list_chats")
      return [...savedChats.values()]
        .filter((item) => item.workspacePath === args.input.workspacePath)
        .map((item) => ({ ...item, messageCount: item.messages.length }));
    if (command === "set_chat_unread") return null;
    return bundle.nativeFixture.invoke(command, args);
  },
};
const desktop = resolve(".");
try {
  const file = join(temp, "integration.mjs");
  await build({
    stdin: {
      contents: `export { chatService, applicationChatHost } from "./src/workbench/shell/chat-service";
        export { createBackendApplicationDataTransport } from "./src/api/applications/data";
        export { createPlaygroundPreferences } from "../applications/builtins/chat-playground/main/preferences";
        export * as nativeFixture from "./scripts/chat/fixtures/api";`,
      resolveDir: desktop,
    },
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    plugins: [
      {
        name: "native-boundary-fixture",
        setup(build) {
          build.onResolve(
            { filter: /^(?:@\/(api\/(agents|skills|knowledge|conversation-ledger)|agent-client\/runtime))$/ },
            () => ({ path: resolve("scripts/chat/fixtures/api.ts") }),
          );
          build.onResolve(
            {
              filter:
                /^(?:@\/transport$|@\/api\/(applications$|workspace$|agent-runtime$|extensions$)|@\/workbench\/pages\/stories\/)/,
            },
            ({ path }) => ({ path, namespace: "fixture" }),
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents:
              path === "@/transport"
                ? "export const invoke = (...args) => globalThis.__playgroundFixture.invoke(...args);"
                : path === "@/api/applications"
                  ? "export const listApplications = async () => globalThis.__playgroundFixture.applications(); export const listApplicationUi = async () => ({applications: [{id: '@mewvis/chat-playground', tools: [{name:'own', description:'Own tool', risk:'low'}]}, {id:'other-application',tools:[{name:'foreign-tool'}]}]});"
                  : path === "@/api/workspace"
                    ? "export const listWorkspaces = async () => globalThis.__playgroundFixture.workspaces();"
                    : path === "@/api/agent-runtime"
                      ? "export const listAgentRuntimeTools = async () => ({tools:[{name:'host',label:'Host',description:'Host tool'}]}); export const releaseAgentRuntimeSession = async () => {}; export const listExtensionCommands = async () => [];"
                      : path === "@/api/extensions"
                        ? "export const listExtensions = async () => [];"
                        : "export const loadStoryById = async () => null; export const prepareStoryChatProfile = () => {throw new Error('Unexpected story access')};",
          }));
        },
      },
    ],
  });
  const load = async (version) => (bundle = await import(`${pathToFileURL(file).href}?${version}`));
  const connect = () => {
    const listeners = new Set();
    const connection = bundle.applicationChatHost.connect(applicationId, ["own"], (event) =>
      listeners.forEach((listener) => listener(event)),
    );
    return createApplicationChatClient({
      request: connection.request,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
  };
  await load(1);
  const transport = bundle.createBackendApplicationDataTransport(applicationId);
  const data = createApplicationDataClient(transport);
  let preferences = bundle.createPlaygroundPreferences(data.storage);
  await preferences.load();
  assert.equal(preferences.workspace(await data.workspaces.list()).id, own.id);
  let chat = connect();
  assert.equal((await chat.listTools()).find((tool) => tool.name === "own").risk, "low");
  assert.deepEqual(
    (await chat.listTools()).map(({ name, source, enabled }) => ({ name, source, enabled })),
    [
      { name: "host", source: "host", enabled: true },
      { name: "own", source: "application", enabled: true },
    ],
    "SDK lists host tools and only the authenticated application's tools",
  );
  state.policy = { allowedToolNames: ["own"] };
  assert.deepEqual(
    (await chat.listTools()).filter((tool) => tool.enabled).map((tool) => tool.name),
    ["own"],
  );
  assert.equal("listWorkspaces" in chat, false, "workspace lookup belongs only to the data SDK");
  assert.deepEqual(await data.workspaces.list(), [own], "application listing must not expose the host default");
  const raw = bundle.applicationChatHost.connect(applicationId, [], () => {});
  await assert.rejects(raw.request({ method: "workspaces" }), /@mewvis\/app-sdk\/data/);
  raw.dispose();
  const nativeReads = () =>
    state.calls.filter(({ command }) => ["list_chats", "load_chat", "save_chat"].includes(command)).length;
  const beforeDenied = nativeReads();
  await assert.rejects(data.workspaces.get(legacy.id), { code: "WORKSPACE_NOT_FOUND" });
  for (const workspaceId of [legacy.id, other.id]) {
    await assert.rejects(chat.listSessions({ workspaceId }), { code: "WORKSPACE_NOT_FOUND" });
    await assert.rejects(chat.openSession({ workspaceId, chatId: "guessed-chat" }), { code: "WORKSPACE_NOT_FOUND" });
    await assert.rejects(
      chat.createSession({ workspaceId, sceneId: "debug", profile: { id: "debug", systemPrompt: "Test" } }),
      { code: "WORKSPACE_NOT_FOUND" },
    );
  }
  assert.equal(nativeReads(), beforeDenied, "unregistered IDs must fail before reading or writing chats");
  state.cancel = true;
  assert.equal(await data.workspaces.create({ name: "Cancelled" }), null);
  assert.equal(state.workspaces.length, 1);
  state.cancel = false;
  const created = await data.workspaces.create({ name: "新目录" });
  const session = await chat.createSession({
    workspaceId: created.id,
    sceneId: "debug",
    profile: { id: "debug", systemPrompt: "Test" },
  });
  assert.equal(
    bundle.chatService.getLocation(bundle.chatService.getSession(session.identity)).workspacePath,
    created.path,
  );
  await session.updateConfig({ permissionMode: "full" });
  const sent = await session.send({ text: "应用目录内的聊天" });
  assert.equal(sent.status, "dispatched");
  assert.deepEqual(bundle.nativeFixture.fake.runs.at(-1).permissions, { mode: "full" });
  assert.deepEqual(
    bundle.nativeFixture.fake.runs.at(-1).resources.tools.allowed,
    ["own"],
    "production Chat applies user grants even when the scene omits allowedToolNames",
  );
  bundle.nativeFixture.fake.events.forEach((listener) =>
    listener({ taskId: sent.taskId, event: { type: "done", text: "已保存" } }),
  );
  await session.flush();
  await preferences.select(created.id, session.identity.id);
  const saved = read(chatFile(created.path, session.identity.id), null);
  assert.equal(saved.workspaceId, created.id);
  assert.equal(saved.origin.applicationId, applicationId);
  assert.ok(saved.messages.length);
  assert.deepEqual(await chat.listSessions({ workspaceId: own.id }), []);
  assert.equal((await chat.listSessions({ workspaceId: created.id }))[0].chatId, session.identity.id);
  // An explicitly admitted directory is usable regardless of its physical location.
  const admitted = { ...legacy, id: "admitted", isDefault: false };
  state.workspaces.push(admitted);
  const shared = await chat.createSession({
    workspaceId: admitted.id,
    sceneId: "debug",
    profile: { id: "debug", systemPrompt: "Test" },
  });
  assert.equal(
    bundle.chatService.getLocation(bundle.chatService.getSession(shared.identity)).workspacePath,
    legacy.path,
  );
  await bundle.chatService.closeAll();
  chat.dispose();
  transport.dispose();

  // Reconstruct the application service and application state from persisted records.
  await load(2);
  const nextTransport = bundle.createBackendApplicationDataTransport(applicationId);
  const nextData = createApplicationDataClient(nextTransport);
  preferences = bundle.createPlaygroundPreferences(nextData.storage);
  await preferences.load();
  assert.equal(preferences.workspace(await nextData.workspaces.list()).id, created.id);
  assert.equal(preferences.chat(created.id), session.identity.id);
  chat = connect();
  const restored = await chat.openSession({ workspaceId: created.id, chatId: preferences.chat(created.id) });
  assert.match(JSON.stringify(restored.getSnapshot().messages), /应用目录内的聊天/);
  assert.equal(restored.getSnapshot().config.permissionMode, "full");
  assert.equal(bundle.nativeFixture.fake.runs.length, 0, "restore must not send to the model");
  for (const code of ["WORKSPACE_UNAVAILABLE", "WORKSPACE_MARKER_INVALID", "PERMISSION_DENIED"]) {
    state.error = code;
    await assert.rejects(chat.listSessions({ workspaceId: created.id }), { code });
  }
  state.error = null;
  await assert.rejects(chat.listSessions({ workspaceId: legacy.id }), { code: "WORKSPACE_NOT_FOUND" });
  state.permissions = permissions.filter((value) => value !== "application-workspaces");
  await assert.rejects(nextData.workspaces.create({ name: "Denied" }), { code: "PERMISSION_DENIED" });
  const beforeMissingPermission = nativeReads();
  await assert.rejects(chat.listSessions({ workspaceId: created.id }), { code: "PERMISSION_DENIED" });
  await assert.rejects(chat.listSessions({ workspaceId: legacy.id }), { code: "PERMISSION_DENIED" });
  assert.equal(nativeReads(), beforeMissingPermission);
  state.permissions = [...permissions];
  state.enabled = false;
  await assert.rejects(chat.listSessions({ workspaceId: created.id }), /授权/);
  state.enabled = true;
  await nextData.storage.clear();
  assert.equal((await nextData.workspaces.get(created.id)).path, created.path);
  assert.ok(read(chatFile(created.path, session.identity.id), null));
  await bundle.chatService.closeAll();
  chat.dispose();
  nextTransport.dispose();
  assert.ok(state.calls.some(({ command }) => command === "disconnect_application_data"));

  // Concurrent UI selections cannot save out of order; a failed save does not poison later writes.
  let value,
    failWrite = false;
  const memory = {
    getItem: async () => value ?? null,
    setItem: async (_key, next) => {
      if (failWrite) throw new Error("disk full");
      await new Promise((done) => setTimeout(done, next.workspaceId === "slow" ? 10 : 0));
      value = structuredClone(next);
    },
  };
  const ordered = bundle.createPlaygroundPreferences(memory);
  await ordered.load();
  await Promise.all([ordered.select("slow", "one"), ordered.select("fast", "two")]);
  assert.equal(value.workspaceId, "fast");
  failWrite = true;
  await assert.rejects(ordered.select("slow"), /disk full/);
  failWrite = false;
  await ordered.select("fast", "latest");
  const reloaded = bundle.createPlaygroundPreferences(memory);
  await reloaded.load();
  assert.equal(reloaded.chat("fast"), "latest");
  assert.equal(reloaded.chat("slow"), "one");
  value = { version: 1, workspaceId: "gone", chats: { invalid: 42 } };
  const invalid = bundle.createPlaygroundPreferences(memory);
  await invalid.load();
  assert.equal(invalid.workspace([own]).id, own.id);
  assert.equal(invalid.chat("invalid"), "");
  console.log(
    "Chat playground data integration passed: SDK directory resolution, persistence, reload, isolation, revocation and ordered preferences.",
  );
} finally {
  await bundle?.chatService.closeAll();
  delete globalThis.__playgroundFixture;
  rmSync(temp, { recursive: true, force: true });
}
