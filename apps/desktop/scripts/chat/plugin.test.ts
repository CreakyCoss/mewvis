import { agentPermissionOptions } from "../../src/agent-client/wire";
import test from "node:test";
import assert from "node:assert/strict";
import { createPluginChatClient, type PluginChatEvent, type PluginChatCreateInput } from "@isle/plugin-sdk/chat";
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
const input: PluginChatCreateInput = {
  workspaceId: "workspace",
  sceneId: "debug",
  profile: { id: "fixture", systemPrompt: "Business context", useKnowledge: true },
};
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function fixture() {
  const sources = new Map<string, () => unknown>();
  const records = new Map();
  const locations = new Map();
  const runs: string[] = [];
  const events = new Set<(event: any) => void>();
  let allowed = true;
  let gate: Promise<void> | undefined;
  const manager = createChatService(
    async ({ identity, workspacePath, workspaceId, origin, profileData, profile }: DesktopSessionInput) => {
      sources.set(JSON.stringify([workspacePath, identity.id]), () => ({
        workspaceId,
        origin,
        profile: profileData,
      }));
      locations.set(JSON.stringify(identity), { workspacePath });
      const key = JSON.stringify(identity);
      const runtime: ChatRuntime = {
        authorize: async () => {
          await profile.authorize?.();
        },
        subscribe: async (listener) => {
          events.add(listener);
          return () => {
            events.delete(listener);
          };
        },
        prepare: async (turn, signal) => {
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
            permissionOptions: structuredClone([...agentPermissionOptions]),
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
    },
  );
  const service = {
    ...manager,
    getLocation: (session: any) => locations.get(JSON.stringify(session.identity)),
    viewPersistence: () => undefined,
    updateContext: async (session: any, context: any) => {
      if (session.getSnapshot().activeTaskId) throw new Error("运行期间不能修改场景上下文");
      const location = locations.get(JSON.stringify(session.identity));
      const source = sources.get(JSON.stringify([location.workspacePath, session.identity.id]))?.() as any;
      if (source?.profile) source.profile.context = structuredClone(context);
    },
    closePlugin: async (pluginId: string) =>
      Promise.all(
        manager
          .listSessions()
          .filter((session) => session.identity.scope.startsWith(`plugin:${pluginId}:workspace:`))
          .map((session) => manager.closeSession(session.identity)),
      ),
    loadRecordSource: async (path: string, id: string) => structuredClone(sources.get(JSON.stringify([path, id]))?.()),
  } as unknown as DesktopChatService;
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

test("plugin clients share one host record, preserve immutable snapshots and reject foreign records and handles", async () => {
  const f = fixture();
  const a = f.connect();
  const b = f.connect();
  const other = f.connect("other");
  const one = await a.client.createSession(input);
  const ref = { workspaceId: input.workspaceId, chatId: one.identity.id };
  const [two, isolated] = await Promise.all([b.client.openSession(ref), other.client.createSession(input)]);
  await assert.rejects(other.client.openSession(ref), /当前插件和工作区/);
  await assert.rejects(a.client.openSession({ ...ref, workspaceId: "other" }), /工作区/);
  assert.equal(f.service.listSessions().length, 2);
  assert.equal(one.identity.id, two.identity.id);
  assert.notEqual(one.identity.id, isolated.identity.id);
  assert.match(one.identity.id, /^[a-f0-9-]{36}$/);
  const handle: any = await a.connection.request({ method: "open", input: ref });
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

test("creation generates distinct host IDs while open only observes an existing record", async () => {
  const f = fixture();
  const { client } = f.connect();
  await assert.rejects(client.openSession({ workspaceId: input.workspaceId, chatId: "missing" }));
  await assert.rejects(client.openSession({ ...input, chatId: "invented" } as any), /不支持/);
  await assert.rejects(client.createSession({ ...input, chatId: "invented" } as any), /不支持/);
  await assert.rejects(client.createSession({ ...input, pluginId: "other" } as any), /不支持/);
  assert.equal(f.service.listSessions().length, 0);
  const [one, two] = await Promise.all([client.createSession(input), client.createSession(input)]);
  assert.notEqual(one.identity.id, two.identity.id);
  const ref = { workspaceId: input.workspaceId, chatId: one.identity.id };
  const views = await Promise.all([client.openSession(ref), client.openSession(ref)]);
  assert.ok(views.every((view) => view === one));
  assert.equal(f.service.listSessions().length, 2);
  assert.equal(f.runs.length, 0);
  await one.close();
  await two.close();
  client.dispose();
});

test("stop cancels host authorization immediately and late authorization cannot dispatch", async () => {
  const f = fixture();
  const { client } = f.connect();
  const session = await client.createSession(input);
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
  const session = await client.createSession(input);
  await assert.rejects(client.createSession({ ...input, workspacePath: "/escape" } as any), /不支持/);
  assert.equal((await session.updateConfig({ permissionMode: "full" })).ok, true);
  assert.equal((await session.updateConfig({ permissionMode: "invalid" as any })).ok, false);
  await assert.rejects(
    session.send({ text: "read", blocks: [{ type: "file-reference", path: "../secret" }] }),
    /授权工作区/,
  );
  assert.deepEqual(
    await session.updateConfig({ selectedSkillKeys: [], permissionMode: "ask", selectedKnowledgeCollectionIds: [] }),
    { ok: true },
  );
  assert.deepEqual(session.getSnapshot().config.permissionMode, "ask");
  await session.setContext({ requestContext: "latest business data" });
  assert.equal(f.runs.length, 0);
  f.setAllowed(false);
  const denied = await session.send({ text: "denied" });
  assert.equal(denied.status, "rejected");
  assert.match(denied.reason ?? "", /permission denied/);
  f.setAllowed(true);
  assert.equal(await client.openSession({ workspaceId: input.workspaceId, chatId: session.identity.id }), session);
  assert.equal((await session.close()).ok, true);
  client.dispose();
});

test("closing and reopening cannot let an old handle close or overwrite the replacement session", async () => {
  const f = fixture();
  const { client } = f.connect();
  const old = await client.createSession(input);
  await old.send({ text: "history" });
  await old.close();
  const fresh = await client.openSession({ workspaceId: input.workspaceId, chatId: old.identity.id });
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
  const session = await c.client.createSession(input);
  const initial: any = await c.connection.request({
    method: "open",
    input: { workspaceId: input.workspaceId, chatId: session.identity.id },
  });
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
  const initial: any = await c.connection.request({ method: "create", input });
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
  await c.connection.request({ method: "updateConfig", handle: initial.handle, input: { permissionMode: "auto" } });
  assert.ok(updates.length);
  assert.ok(updates.every((event) => event.watchId === "new"));
  c.client.dispose();
});

test("revoking a plugin stops its tasks while keeping other plugin sessions alive", async () => {
  const f = fixture();
  const a = f.connect("a");
  const b = f.connect("b");
  const one = await a.client.createSession(input);
  const two = await b.client.createSession(input);
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
  const session = await native.client("plugin").createSession(input);
  const ui = f.connect();
  const view = await ui.client.openSession({ workspaceId: input.workspaceId, chatId: session.identity.id });
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

test("plugin can observe an approval but cannot authorize it through question answers or RPC", async () => {
  const f = fixture();
  const c = f.connect();
  const session = await c.client.createSession(input);
  const detach = session.subscribe(() => {});
  await tick();
  await session.send({ text: "work" });
  const taskId = session.getSnapshot().activeTaskId!;
  f.events.forEach((listener) =>
    listener({
      taskId,
      event: {
        type: "approval_requested",
        taskId,
        approvalId: "approval",
        executionId: "call",
        summary: "own",
        details: "{}",
        reason: "operation",
        expiresAt: Date.now() + 60_000,
      },
    }),
  );
  assert.equal(session.getSnapshot().pendingApproval?.approvalId, "approval");
  assert.equal((await session.answer({ questionId: "approval", answer: "yes" })).ok, false);
  const opened: any = await c.connection.request({
    method: "open",
    input: { workspaceId: input.workspaceId, chatId: session.identity.id },
  });
  await assert.rejects(
    c.connection.request({
      method: "answerApproval",
      handle: opened.handle,
      input: { taskId, approvalId: "approval", approved: true },
    } as any),
    /不支持/,
  );
  assert.equal(session.getSnapshot().pendingApproval?.approvalId, "approval");
  f.events.forEach((listener) =>
    listener({
      taskId,
      event: {
        type: "question",
        taskId,
        questionId: "question",
        question: "Optional detail?",
        expiresAt: Date.now() + 3 * 60_000,
      },
    }),
  );
  assert.equal((await session.answer({ questionId: "question", answer: null })).ok, true);
  assert.equal(session.getSnapshot().pendingQuestion, null);
  assert.equal(
    session.getSnapshot().pendingApproval?.approvalId,
    "approval",
    "Cancelling a question cannot resolve an approval",
  );
  detach();
  await session.close();
  c.client.dispose();
});
