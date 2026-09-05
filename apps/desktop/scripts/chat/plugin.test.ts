import test from "node:test";
import assert from "node:assert/strict";
import { createPluginChatClient, type PluginChatEvent, type PluginChatInput } from "@isle/plugin-sdk/chat";
import { createChatService, createChatSession, type ChatRuntime } from "../../src/chat/core";
import { createPluginChatHost } from "../../src/chat/desktop/plugin";
import type { DesktopSessionInput, DesktopChatService } from "../../src/chat/desktop/service";
import { createNativePluginChat } from "../../plugin-host/src/chat";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const input: PluginChatInput = {
  workspaceId: "workspace",
  chatId: "logical-id",
  profile: { id: "fixture", systemPrompt: "Business context", useKnowledge: true },
};
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function fixture() {
  const records = new Map();
  const locations = new Map();
  const runs: string[] = [];
  const events = new Set<(event: any) => void>();
  let allowed = true;
  let gate: Promise<void> | undefined;
  const manager = createChatService(async ({ identity, workspacePath, profile }: DesktopSessionInput) => {
    locations.set(JSON.stringify(identity), { workspacePath });
    const key = JSON.stringify(identity);
    const runtime: ChatRuntime = {
      subscribe: async (listener) => {
        events.add(listener);
        return () => {
          events.delete(listener);
        };
      },
      prepare: async (turn, signal) => {
        await profile.authorize?.();
        signal.throwIfAborted();
        return {
          dispatch: async () => {
            signal.throwIfAborted();
            runs.push(turn.taskId);
          },
        };
      },
      abort: async () => {},
      answer: async () => {},
      release: async () => {},
    };
    return createChatSession({
      identity,
      runtime,
      storage: {
        load: async () => records.get(key) ?? null,
        save: async (record) => {
          records.set(key, structuredClone(record));
        },
      },
      catalog: {
        load: async () => ({
          models: [{ value: "model", label: "Model", selectedLabel: "Model", description: "", isDefault: true }],
          tools: [{ value: "own", label: "Own tool", description: "", isDefault: true }],
          skillGroups: [
            {
              value: "group",
              label: "Skills",
              description: "",
              isDefault: true,
              skills: [{ key: "skill", name: "Skill", label: "Skill", description: "" }],
            },
          ],
          knowledgeCollections: [{ value: "knowledge", label: "Knowledge", description: "", isDefault: true }],
        }),
      },
    });
  });
  const service = {
    ...manager,
    getLocation: (session: any) => locations.get(JSON.stringify(session.identity)),
  } as DesktopChatService;
  const host = createPluginChatHost(service, {
    authorize: async () => {
      await gate;
      if (!allowed) throw new Error("permission denied");
      return { workspacePath: "/fixture", knowledge: true };
    },
  });
  const connect = (pluginId = "plugin") => {
    const listeners = new Set<(event: PluginChatEvent) => void>();
    const connection = host.connect(pluginId, ["own"], (event) =>
      listeners.forEach((listener) => listener(structuredClone(event))),
    );
    const client = createPluginChatClient({
      request: async (request) => structuredClone(await connection.request(structuredClone(request))),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    return { client, connection, listeners };
  };
  return {
    host,
    service,
    records,
    runs,
    events,
    connect,
    setAllowed: (value: boolean) => (allowed = value),
    setGate: (value?: Promise<void>) => (gate = value),
  };
}

test("plugin clients share one host owner, scope disk IDs, preserve immutable snapshots and reject forged handles", async () => {
  const f = fixture();
  const a = f.connect();
  const b = f.connect();
  const other = f.connect("other");
  const [one, two, isolated] = await Promise.all([
    a.client.openSession(input),
    b.client.openSession(input),
    other.client.openSession(input),
  ]);
  assert.equal(f.service.listSessions().length, 2);
  assert.equal(one.identity.id, two.identity.id);
  assert.notEqual(one.identity.id, isolated.identity.id);
  assert.match(one.identity.id, /^plugin-[a-f0-9]{64}$/);
  const handle: any = await a.connection.request({ method: "open", input });
  await assert.rejects(b.connection.request({ method: "snapshot", handle: handle.handle }), /句柄/);
  assert.throws(() => (one.getSnapshot().config.selectedModelId = "mutated"));
  const off = one.subscribe(() => {});
  const off2 = two.subscribe(() => {});
  await tick();
  assert.equal((await one.send({ text: "hello", requestId: "one" })).status, "dispatched");
  assert.equal(two.getSnapshot().phase, "running");
  assert.equal(isolated.getSnapshot().messages.length, 0);
  off();
  off2();
  await tick();
  assert.equal(f.events.size, 2);
  assert.equal(f.service.getSession(one.identity)?.getSnapshot().phase, "running");
  const taskId = f.runs[0];
  f.events.forEach((emit) => emit({ taskId, event: { type: "text_delta", delta: "stream" } }));
  f.events.forEach((emit) => emit({ taskId, event: { type: "done", text: "stream" } }));
  await tick();
  await one.reconnect();
  assert.equal(one.getSnapshot().phase, "idle");
  assert.match(JSON.stringify(one.getSnapshot().messages), /stream/);
  assert.ok(f.records.size);
  a.client.dispose();
  b.client.dispose();
  other.client.dispose();
});

test("stop cancels host authorization immediately and late authorization cannot dispatch", async () => {
  const f = fixture();
  const { client } = f.connect();
  const session = await client.openSession(input);
  const gate = deferred();
  f.setGate(gate.promise);
  const sending = session.send({ text: "cancel before auth completes" });
  await tick();
  assert.deepEqual(await session.stop(), { ok: true });
  assert.equal((await sending).status, "cancelled");
  gate.resolve();
  f.setGate();
  await tick();
  assert.equal(f.runs.length, 0);
  assert.equal((await session.send({ text: "next" })).status, "dispatched");
  await session.close();
  client.dispose();
});

test("resource configuration is host-validated; unknown fields and traversal never reach the session", async () => {
  const f = fixture();
  const { client } = f.connect();
  const session = await client.openSession(input);
  await assert.rejects(client.openSession({ ...input, workspacePath: "/escape" } as any), /不支持/);
  await assert.rejects(
    client.openSession({ ...input, profile: { ...input.profile, allowedToolNames: ["other-plugin"] } }),
    /其他插件/,
  );
  assert.equal((await session.updateConfig({ selectedToolNames: ["other-plugin"] })).ok, false);
  await assert.rejects(
    session.send({ text: "read", blocks: [{ type: "file-reference", path: "../secret" }] }),
    /授权工作区/,
  );
  assert.deepEqual(
    await session.updateConfig({ selectedSkillKeys: [], selectedToolNames: [], selectedKnowledgeCollectionIds: [] }),
    { ok: true },
  );
  assert.deepEqual(session.getSnapshot().config.selectedToolNames, []);
  await session.setContext({ requestContext: "latest business data" });
  assert.equal(f.runs.length, 0);
  f.setAllowed(false);
  await assert.rejects(session.send({ text: "denied" }), /permission denied/);
  f.setAllowed(true);
  assert.equal(await client.openSession(input), session);
  assert.equal((await session.close()).ok, true);
  client.dispose();
});

test("closing and reopening cannot let an old handle close or overwrite the replacement session", async () => {
  const f = fixture();
  const { client } = f.connect();
  const old = await client.openSession(input);
  await old.send({ text: "history" });
  await old.close();
  const fresh = await client.openSession(input);
  assert.notEqual(old, fresh);
  assert.equal(fresh.getSnapshot().messages.length, 2);
  assert.equal((await old.close()).ok, true);
  assert.equal(f.service.getSession(fresh.identity)?.getSnapshot().phase, "idle");
  await fresh.close();
  client.dispose();
});

test("stale mirror events are ignored and transport reconnection clears local errors", async () => {
  const f = fixture();
  const c = f.connect();
  const session = await c.client.openSession(input);
  const initial: any = await c.connection.request({ method: "open", input });
  await session.send({ text: "latest" });
  const state = session.getSnapshot();
  c.listeners.forEach((listener) => listener(initial));
  assert.equal(session.getSnapshot(), state);
  const off = session.subscribe(() => {});
  off();
  const second = session.subscribe(() => {});
  await tick();
  f.setAllowed(false);
  assert.equal((await session.updateConfig({})).ok, false);
  assert.match(session.getSnapshot().error ?? "", /permission denied/);
  f.setAllowed(true);
  await session.reconnect();
  assert.equal(session.getSnapshot().error, f.service.getSession(session.identity)?.getSnapshot().error);
  second();
  c.client.dispose();
});

test("an old watch cannot replace a newer watch after asynchronous authorization", async () => {
  const f = fixture();
  const c = f.connect();
  const initial: any = await c.connection.request({ method: "open", input });
  const gate = deferred();
  f.setGate(gate.promise);
  const oldWatch = c.connection.request({ method: "watch", handle: initial.handle, watchId: "old" });
  await c.connection.request({ method: "unwatch", handle: initial.handle, watchId: "old" });
  f.setGate();
  await c.connection.request({ method: "watch", handle: initial.handle, watchId: "new" });
  gate.resolve();
  await oldWatch;
  const updates: PluginChatEvent[] = [];
  c.listeners.add((event) => updates.push(event));
  await c.connection.request({ method: "updateConfig", handle: initial.handle, input: { selectedToolNames: [] } });
  assert.ok(updates.length);
  assert.ok(updates.every((event) => event.watchId === "new"));
  c.client.dispose();
});

test("revoking a plugin stops its tasks while keeping other plugin sessions alive", async () => {
  const f = fixture();
  const a = f.connect("a");
  const b = f.connect("b");
  const one = await a.client.openSession(input);
  const two = await b.client.openSession(input);
  await one.send({ text: "a" });
  await two.send({ text: "b" });
  assert.deepEqual(await f.host.revoke("a"), [{ ok: true }]);
  assert.equal(f.service.getSession(one.identity), undefined);
  assert.equal(f.service.getSession(two.identity)?.getSnapshot().phase, "running");
  await two.close();
  a.client.dispose();
  b.client.dispose();
});

test("native no-UI plugin transport uses the same host sessions as iframe clients", async () => {
  const f = fixture();
  const native = createNativePluginChat(
    (message: any) => {
      void connection.request(message.request).then(
        (result) => native.receive({ type: "plugin-chat:response", id: message.id, result }),
        (error) => native.receive({ type: "plugin-chat:response", id: message.id, error: String(error) }),
      );
    },
    () => ["own"],
  );
  const connection = f.host.connect("plugin", ["own"], (event) =>
    native.receive({ type: "plugin-chat:snapshot", pluginId: "plugin", event }),
  );
  const session = await native.client("plugin").openSession(input);
  const ui = f.connect();
  const view = await ui.client.openSession(input);
  const off = view.subscribe(() => {});
  await tick();
  assert.equal((await session.send({ text: "from Node" })).status, "dispatched");
  assert.equal(view.getSnapshot().phase, "running");
  assert.equal(f.service.listSessions().length, 1);
  await session.stop();
  await session.close();
  off();
  native.dispose();
  ui.client.dispose();
});

test(
  "real plugin-host stdio can receive chat responses while a plugin tool is awaiting them",
  { timeout: 20_000 },
  async () => {
    const f = fixture();
    const directory = await mkdtemp(join(tmpdir(), "isle-native-chat-"));
    const child = spawn(process.execPath, ["agent-runtime/dist/plugin-host/service.mjs"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", (data) => (errors += String(data)));
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
    let nextId = 0;
    const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
    const connection = f.host.connect("plugin", ["fixture_chat"], (event) =>
      send({ type: "plugin-chat:snapshot", pluginId: "plugin", event }),
    );
    const reader = createInterface({ input: child.stdout });
    reader.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.type === "plugin-chat:request") {
        void connection.request(message.request).then(
          (result) => send({ type: "plugin-chat:response", id: message.id, pluginId: message.pluginId, result }),
          (error) => send({ type: "plugin-chat:response", id: message.id, error: String(error) }),
        );
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message + errors));
      else request.resolve(message.result);
    });
    child.on("exit", () => {
      pending.forEach((request) => request.reject(new Error("Plugin host exited: " + errors)));
      pending.clear();
    });
    const rpc = (method: string, params?: unknown) =>
      new Promise<any>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        send({ id, method, params });
      });
    try {
      const packageRoot = resolve("scripts/chat/fixtures/plugin/dist/isle");
      const configured = await rpc("configure", {
        settingsPath: directory,
        plugins: [
          {
            kind: "isle",
            id: "plugin",
            name: "Fixture",
            version: "0.0.0",
            description: "",
            source: "installed",
            entry: join(packageRoot, "index.js"),
            packageRoot,
            permissions: ["chat", "workspace-files", "chat-knowledge"],
            permissionStatus: "declared",
          },
        ],
      });
      assert.equal(configured.plugins[0].error, null);
      const result = await rpc("execute", { pluginId: "plugin", toolName: "fixture_chat", arguments: {} });
      assert.equal(result.value.status, "dispatched");
      assert.equal(f.runs.length, 1);
      assert.equal(f.service.listSessions().length, 0);
      await rpc("shutdown");
    } finally {
      connection.dispose();
      reader.close();
      child.kill();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
