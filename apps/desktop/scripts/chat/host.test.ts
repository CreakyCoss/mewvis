import test from "node:test";
import assert from "node:assert/strict";
import { fake } from "./fixtures/api";
import { createDesktopCatalog } from "../../src/chat/desktop/catalog";
import { createDesktopStorage } from "../../src/chat/desktop/storage";
import {
  createDesktopChatService,
  type DesktopChatService,
  type DesktopSessionInput,
} from "../../src/chat/desktop/service";
import { summarizeChatLedger } from "../../src/chat/desktop/ledger";
import { getLlmSettings, getLlmModelOptions, resolveLlmModel, saveLlmSettings } from "../../src/api/llm";
import { createPluginChatHost } from "../../src/chat/desktop/plugin";
import { createPluginChatClient, type PluginChatEvent } from "@isle/plugin-sdk/chat";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const summaryInput = {
  workspacePath: "fixture",
  sessionRootDir: "chats/record/session",
  selectedModelId: "model",
  summaryInstruction: "Summarize",
};

const pluginInput = {
  workspaceId: "workspace",
  sceneId: "debug",
  profile: {
    id: "plugin-scene",
    systemPrompt: "Keep the plugin scene",
    context: { requestContext: "initial" },
    useKnowledge: true,
  },
};
const historyInput = (id: string) => ({
  identity: { scope: "workspace:workspace", id },
  workspacePath: "fixture",
  workspaceId: "workspace",
  origin: { kind: "builtin" as const, sceneId: "chat" },
  profile: { id: "workspace", systemPrompt: () => "WORKSPACE FALLBACK MUST NOT BE USED" },
});
function pluginFixture(availableTools = ["own"]) {
  const service = createDesktopChatService({ resolveRecord: (...args) => host.resolveSession(...args) });
  let allowed = true;
  const host = createPluginChatHost(service, {
    tools: async () => availableTools,
    authorize: async () => {
      if (!allowed) throw new Error("permission revoked");
      return { workspacePath: "fixture", knowledge: true };
    },
  });
  const listeners = new Set<(event: PluginChatEvent) => void>();
  const connection = host.connect("plugin", ["own"], (event) => listeners.forEach((listener) => listener(event)));
  const client = createPluginChatClient({
    request: (request) => connection.request(structuredClone(request)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  return {
    service,
    host,
    client,
    connection,
    revoke: () => {
      allowed = false;
    },
  };
}
async function openHistorySession(service: DesktopChatService, input: DesktopSessionInput) {
  const view = await service.openRecord(input);
  if (!view.session) throw new Error(view.history.reason);
  return view.session;
}
function completeTask(taskId: string) {
  fake.events.forEach((listener) => listener({ taskId, event: { type: "done", taskId, text: "Complete" } }));
}

test("catalog, model resolution and summaries share one cold read; callers cannot mutate the cache", async () => {
  const before = fake.llmReads;
  const [settings, options, model] = await Promise.all([
    getLlmSettings(),
    getLlmModelOptions(),
    resolveLlmModel("model"),
    summarizeChatLedger(summaryInput),
  ]);
  assert.equal(fake.llmReads - before, 1);
  assert.equal(model.apiKey, "secret-must-not-reach-ui");
  assert.doesNotMatch(JSON.stringify(options), /apiKey|secret-must-not-reach-ui/);
  settings.providers[0].apiKey = "caller mutation";
  model.apiKey = "another mutation";
  await summarizeChatLedger(summaryInput);
  assert.equal(fake.summaries.at(-1).runtimeModel.apiKey, "secret-must-not-reach-ui");
  assert.equal(fake.llmReads - before, 1);
});

test("resource loading tolerates tools failure; UI descriptors contain no runtime secrets or skill bodies", async () => {
  const client = {
    capabilities: {
      async listAgentTools() {
        throw new Error("plugin schema failure");
      },
    },
  };
  const catalog = createDesktopCatalog(client as any, () => ({ id: "workspace", systemPrompt: () => "" }));
  const data = await catalog.load();
  assert.equal(data.models?.length, 1);
  assert.equal(data.skillGroups?.[0].skills.length, 1);
  assert.equal(data.knowledgeCollections?.length, 1);
  assert.match(data.errors?.tools ?? "", /工具/);
  assert.deepEqual(data.permissionOptions, []);
  assert.doesNotMatch(
    JSON.stringify(data),
    /apiKey|runtimeModel|secret-must-not-reach-ui|private skill body|\/skills\/private/,
  );
});
test("plugin selection, restoration and dispatch use the same permission modes as the host", async () => {
  fake.record = null;
  const first = pluginFixture(["own", "host"]);
  const second = pluginFixture(["own", "host"]);
  try {
    const plugin = await first.client.createSession({
      ...pluginInput,
      profile: { ...pluginInput.profile, allowedToolNames: ["own", "host"] },
    });
    assert.equal((await plugin.updateConfig({ permissionMode: "full" })).ok, true);
    const sent = await plugin.send({ text: "use assigned tools" });
    assert.equal(sent.status, "dispatched");
    assert.deepEqual(fake.runs.at(-1).permissions, { mode: "full" });
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, ["own", "host"]);
    completeTask(sent.taskId!);
    await plugin.flush();
    await first.service.closeAll();
    const restored = await openHistorySession(second.service, historyInput(plugin.identity.id));
    assert.equal(restored.getSnapshot().config.permissionMode, "full");
  } finally {
    await first.service.closeAll();
    await second.service.closeAll();
    first.connection.dispose();
    second.connection.dispose();
  }
});
test("legacy record codec preserves options and serializes view/config/unread changes", async () => {
  fake.record = {
    id: "old",
    workspaceId: "workspace",
    origin: { kind: "builtin", sceneId: "chat" },
    title: "Old title",
    messages: [
      {
        id: "m",
        role: "assistant",
        createdAt: 1,
        status: "done",
        blocks: [{ id: "b", type: "text", content: "Old message" }],
      },
    ],
    options: {
      selectedModelId: "model",
      permissionMode: "catalog-defined-mode",
      selectedSkillKeys: ["skill"],
      selectedKnowledgeCollectionIds: ["knowledge"],
      showThinkingProcess: false,
      futureField: "preserve",
    },
    createdAt: 1,
    updatedAt: 1,
    isUnread: true,
  };
  fake.writes = [];
  fake.maxPending = 0;
  const host = createDesktopStorage("fixture", "old", () => {});
  const record = await host.storage.load();
  assert.equal((await host.loadPreferences()).showThinkingProcess, false);
  assert.equal((record!.config as any).showThinkingProcess, undefined);
  assert.equal(record!.config!.permissionMode, "catalog-defined-mode", "the codec must not maintain a mode enum");
  await Promise.all([
    host.storage.save({ ...record!, config: { ...record!.config, selectedSkillKeys: [] } }),
    host.savePreferences({ showThinkingProcess: true, showToolCallProcess: false }),
    host.setUnread(false),
  ]);
  assert.equal(fake.maxPending, 1);
  assert.equal(fake.record.options.futureField, "preserve");
  assert.equal(fake.record.options.showThinkingProcess, true);
  assert.equal(fake.record.options.showToolCallProcess, false);
  assert.deepEqual(fake.record.options.selectedSkillKeys, []);
  assert.equal(fake.record.isUnread, false);
  fake.failSave = true;
  await assert.rejects(host.savePreferences({ showThinkingProcess: false, showToolCallProcess: false }));
  await assert.rejects(host.storage.flush!());
  fake.failSave = false;
  await host.storage.flush!();
  assert.equal(fake.record.options.showThinkingProcess, false);
  fake.failUnread = true;
  await assert.rejects(host.setUnread(true));
  await assert.rejects(host.flush());
  fake.failUnread = false;
  await host.flush();
  assert.equal(fake.record.isUnread, true);
});
test("desktop owner isolates locations and refreshes scene context without exposing credentials", async () => {
  fake.record = null;
  fake.runs = [];
  const owner = createDesktopChatService();
  const identity = { scope: "scene", id: "record" };
  const profile = { id: "scene", systemPrompt: () => "revision one" };
  const input = { ...historyInput(identity.id), identity, profile };
  const session = await owner.openSession(input);
  const readsAfterOpen = fake.llmReads;
  assert.equal(await owner.openSession(input), session);
  await assert.rejects(owner.openSession({ ...input, workspacePath: "other" }), /存储位置/);
  await assert.rejects(owner.openSession({ ...input, identity: { scope: "other", id: "record" } }), /其他作用域/);
  await session.send({ text: "first" });
  await session.stop();
  assert.match(fake.runs[0].systemPrompt, /revision one/);
  await summarizeChatLedger(summaryInput);
  assert.equal(fake.llmReads, readsAfterOpen, "sending and summarizing reuse the catalog configuration");
  const refreshed = await owner.openSession({ ...input, profile: { ...profile, systemPrompt: () => "revision two" } });
  assert.equal(refreshed, session);
  await session.send({ text: "second" });
  await session.stop();
  assert.match(fake.runs[1].systemPrompt, /revision two/);
  assert.doesNotMatch(JSON.stringify(session.getSnapshot()), /secret-must-not-reach-ui|apiKey|runtimeModel/);
  assert.equal(fake.runs[1].sessionRootDir, "chats/record/session");
  assert.equal((await owner.closeAll()).ok, true);
  assert.equal(owner.listSessions().length, 0);
});
test("failed history load never saves an empty replacement", async () => {
  fake.failLoad = true;
  const count = fake.writes.length;
  const host = createDesktopStorage("fixture", "broken", () => {});
  await assert.rejects(host.storage.load());
  await assert.rejects(host.storage.save({ title: "", messages: [] }));
  assert.equal(fake.writes.length, count);
  fake.failLoad = false;
});

test("a successful save supersedes both late read results and late read failures", async () => {
  for (const failRead of [false, true]) {
    const old = await getLlmSettings();
    const gate = deferred<any>();
    fake.readLlm = () => gate.promise;
    const pending = getLlmSettings({ refresh: true });
    await tick();
    const reads = fake.llmReads;
    const updated = structuredClone(old) as any;
    updated.providers[0].apiKey = `rotated-key-${failRead}`;
    await saveLlmSettings(updated);
    if (failRead) gate.reject(new Error("late read failure"));
    else gate.resolve(old);
    try {
      assert.equal((await pending).providers[0].apiKey, updated.providers[0].apiKey);
      assert.equal((await resolveLlmModel("model")).apiKey, updated.providers[0].apiKey);
      await summarizeChatLedger(summaryInput);
      assert.equal(fake.summaries.at(-1).runtimeModel.apiKey, updated.providers[0].apiKey);
      assert.equal(fake.llmReads, reads, "the save response replaces the cache without another query");
    } finally {
      fake.readLlm = undefined;
    }
  }
});

test("reads wait for queued saves and use the authoritative saved configuration", async () => {
  const original = await getLlmSettings();
  const first = deferred<void>();
  const second = deferred<void>();
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  fake.saveLlm = async (input) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await (++calls === 1 ? first.promise : second.promise);
    active--;
    return {
      ...input,
      providers: input.providers.map((provider: any) => ({ ...provider, apiEndpoint: "https://normalized.invalid" })),
    };
  };
  const firstInput = structuredClone(original) as any;
  firstInput.providers[0].apiKey = "first-save";
  const secondInput = structuredClone(original) as any;
  secondInput.providers[0].apiKey = "second-save";
  const reads = fake.llmReads;
  const saveFirst = saveLlmSettings(firstInput);
  const saveSecond = saveLlmSettings(secondInput);
  let resolved = false;
  const waitingModel = resolveLlmModel("model").then((model) => {
    resolved = true;
    return model;
  });
  await tick();
  assert.equal(calls, 1);
  assert.equal(resolved, false);
  first.resolve();
  await saveFirst;
  await tick();
  assert.equal(calls, 2);
  assert.equal(resolved, false);
  second.resolve();
  await saveSecond;
  try {
    const model = await waitingModel;
    assert.equal(model.apiKey, "second-save");
    assert.equal(model.apiEndpoint, "https://normalized.invalid");
    assert.equal(maxActive, 1);
    assert.equal(fake.llmReads, reads);
  } finally {
    fake.saveLlm = undefined;
  }
});

test("failed saves preserve the last usable cache and do not poison later saves", async () => {
  const original = await getLlmSettings();
  const reads = fake.llmReads;
  fake.saveLlm = async () => {
    throw new Error("save failed");
  };
  try {
    await assert.rejects(saveLlmSettings(original as any), /save failed/);
    assert.equal((await resolveLlmModel("model")).apiKey, original.providers[0].apiKey);
    assert.equal(fake.llmReads, reads);
  } finally {
    fake.saveLlm = undefined;
  }
  const updated = structuredClone(original) as any;
  updated.providers[0].models[0].isEnabled = false;
  await saveLlmSettings(updated);
  assert.deepEqual(await getLlmModelOptions(), []);
  await assert.rejects(resolveLlmModel("model"), /不可用/);
  await assert.rejects(summarizeChatLedger(summaryInput), /不可用/);
  await saveLlmSettings(original as any);
});

test("explicit session refresh coalesces model reads, exposes failures and recovers", async () => {
  fake.record = null;
  const owner = createDesktopChatService();
  const input = historyInput("refresh");
  const [a, b] = await Promise.all(
    ["a", "b"].map((id) => owner.openSession({ ...input, identity: { scope: "refresh", id } })),
  );
  fake.llmSettings.providers[0].name = "Updated provider";
  fake.llmSettings.providers[0].apiKey = "updated-outside-cache";
  const reads = fake.llmReads;
  await owner.refreshResources();
  assert.equal(fake.llmReads - reads, 1);
  for (const session of [a, b]) assert.match(session.getSnapshot().resources.models![0].label, /Updated provider/);
  assert.equal((await resolveLlmModel("model")).apiKey, "updated-outside-cache");
  fake.readLlm = async () => {
    throw new Error("database unavailable");
  };
  try {
    await a.refreshResources();
    assert.match(a.getSnapshot().resources.errors?.models ?? "", /模型/);
    assert.equal(a.getSnapshot().resources.skillGroups?.[0].skills.length, 1);
    assert.equal(a.getSnapshot().config.selectedModelId, "model");
    await assert.rejects(resolveLlmModel("model"), /database unavailable/);
  } finally {
    fake.readLlm = undefined;
  }
  await a.refreshResources();
  assert.equal(a.getSnapshot().resources.errors?.models, undefined);
  await a.send({ text: "use refreshed model" });
  await a.stop();
  assert.equal(fake.runs.at(-1).runtimeModel.apiKey, "updated-outside-cache");
  assert.equal((await owner.closeAll()).ok, true);
});

test("completed plugin chats open from history as the same owner and retain scene, permissions and save queue", async () => {
  fake.record = null;
  fake.runs = [];
  const f = pluginFixture();
  const plugin = await f.client.createSession(pluginInput);
  await plugin.setContext({ requestContext: "updated scene" });
  const sent = await plugin.send({ text: "first turn" });
  assert.equal(sent.status, "dispatched");
  completeTask(sent.taskId!);
  await plugin.flush();
  const owner = f.service.getSession(plugin.identity)!;
  assert.equal(owner.getSnapshot().phase, "idle");
  const [first, second] = await Promise.all([
    openHistorySession(f.service, historyInput(plugin.identity.id)),
    openHistorySession(f.service, historyInput(plugin.identity.id)),
  ]);
  assert.equal(first, owner);
  assert.equal(second, owner);
  assert.equal(f.service.listSessions().length, 1);
  assert.deepEqual(
    owner.getSnapshot().resources.tools?.map((tool) => tool.value),
    ["own"],
  );
  const next = await first.send({ text: "continue from sidebar" });
  assert.match(fake.runs.at(-1).systemPrompt, /Keep the plugin scene/);
  assert.match(fake.runs.at(-1).requestContext, /updated scene/);
  assert.equal(
    await openHistorySession(f.service, historyInput(plugin.identity.id)),
    owner,
    "running views also share the owner",
  );
  await assert.rejects(f.service.openSession(historyInput(plugin.identity.id)), /来源不匹配/);
  completeTask(next.taskId!);
  await owner.flush();
  f.revoke();
  const view = await f.service.openRecord(historyInput(plugin.identity.id));
  assert.equal(view.session, undefined);
  assert.deepEqual(view.history!.messages, owner.getSnapshot().messages);
  assert.equal((await owner.send({ text: "not authorized" })).status, "rejected");
  assert.equal(fake.runs.length, 2);
  fake.failSave = true;
  await assert.rejects(
    f.service.viewPersistence(owner)!.savePreferences({ showThinkingProcess: false, showToolCallProcess: true }),
  );
  assert.equal((await f.service.closeRecord("fixture", plugin.identity.id)).ok, false);
  assert.equal(f.service.getSession(plugin.identity), owner, "failed saves retain ownership");
  fake.failSave = false;
  assert.equal((await f.service.closeRecord("fixture", plugin.identity.id)).ok, true);
  assert.equal(f.service.listSessions().length, 0);
  f.connection.dispose();
});

test("history restores plugin ownership and dynamic context after restart, including later plugin reconnection", async () => {
  fake.record = null;
  const first = pluginFixture();
  const plugin = await first.client.createSession(pluginInput);
  const sent = await plugin.send({ text: "remember" });
  completeTask(sent.taskId!);
  await plugin.flush();
  await plugin.setContext({ requestContext: "persisted after the last turn" });
  await plugin.updateConfig({ selectedSkillKeys: [], selectedKnowledgeCollectionIds: [], permissionMode: "ask" });
  await plugin.flush();
  await first.service.closeAll();
  first.connection.dispose();
  const saved = structuredClone(fake.record);
  assert.deepEqual(saved.origin, { kind: "plugin", pluginId: "plugin", sceneId: "debug" });
  assert.equal(saved.workspaceId, "workspace");
  assert.equal(saved.options.chatOrigin, undefined);
  assert.equal(saved.options.profile.id, pluginInput.profile.id);
  assert.doesNotMatch(
    JSON.stringify({ workspaceId: saved.workspaceId, origin: saved.origin, profile: saved.options.profile }),
    /apiKey|runtimeModel|secret-must-not-reach-ui/,
  );
  const second = pluginFixture();
  const [a, b] = await Promise.all([
    openHistorySession(second.service, historyInput(plugin.identity.id)),
    openHistorySession(second.service, historyInput(plugin.identity.id)),
  ]);
  assert.equal(a, b);
  assert.deepEqual(a.identity, plugin.identity);
  assert.deepEqual(a.getSnapshot().config.selectedSkillKeys, []);
  assert.deepEqual(a.getSnapshot().config.permissionMode, "ask");
  assert.deepEqual(a.getSnapshot().config.selectedKnowledgeCollectionIds, []);
  assert.equal(a.getSnapshot().messages.length, saved.messages.length);
  const reconnect = await second.client.openSession({ workspaceId: "workspace", chatId: plugin.identity.id });
  assert.equal(second.service.getSession(reconnect.identity), a);
  const sentAgain = await reconnect.send({ text: "continue after restart" });
  assert.match(fake.runs.at(-1).requestContext, /persisted after the last turn/);
  completeTask(sentAgain.taskId!);
  await second.service.closeAll();
  second.connection.dispose();

  const pluginFirst = pluginFixture();
  const connectedFirst = await pluginFirst.client.openSession({ workspaceId: "workspace", chatId: plugin.identity.id });
  const fromPlugin = await connectedFirst.send({ text: "plugin opens first after restart" });
  assert.match(fake.runs.at(-1).requestContext, /persisted after the last turn/);
  completeTask(fromPlugin.taskId!);
  const closing = pluginFirst.service.closeRecord("fixture", plugin.identity.id);
  const reopening = openHistorySession(pluginFirst.service, historyInput(plugin.identity.id));
  assert.equal((await closing).ok, true);
  const reopened = await reopening;
  assert.deepEqual(reopened.identity, plugin.identity);
  assert.equal(reopened.getSnapshot().phase, "idle");
  assert.equal(
    pluginFirst.service.listSessions().length,
    1,
    "history waits for an explicit owner close before restoring",
  );
  await pluginFirst.service.closeAll();
  pluginFirst.connection.dispose();

  const denied = pluginFixture();
  denied.revoke();
  const writes = fake.writes.length;
  const subscriptions = fake.events.size;
  const runs = fake.runs.length;
  const readonly = await denied.service.openRecord(historyInput(plugin.identity.id));
  assert.equal(readonly.session, undefined);
  assert.match(readonly.history!.reason, /permission revoked/);
  assert.equal(readonly.history!.canRetry, true);
  assert.deepEqual(readonly.history!.messages, fake.record.messages);
  assert.equal(fake.events.size, subscriptions, "read-only history does not subscribe to a runtime");
  assert.equal(fake.writes.length, writes, "read-only history does not save or rewrite messages");
  assert.equal(fake.runs.length, runs);
  assert.equal(denied.service.listSessions().length, 0, "no workspace fallback on failed plugin authorization");
  denied.connection.dispose();
  const invalid = pluginFixture();
  await assert.rejects(
    invalid.host.resolveSession("other", plugin.identity.id, {
      workspaceId: saved.workspaceId,
      origin: saved.origin,
      profile: saved.options.profile,
    }),
    /工作区与记录不匹配/,
  );
  await assert.rejects(invalid.client.openSession({ workspaceId: "workspace", chatId: "missing" }), /未找到聊天记录/);
  saved.options.profile.allowedToolNames = ["host"];
  await assert.rejects(
    invalid.host.resolveSession("fixture", plugin.identity.id, {
      workspaceId: saved.workspaceId,
      origin: saved.origin,
      profile: saved.options.profile,
    }),
    /未分配/,
  );
  assert.equal(invalid.service.listSessions().length, 0);
  invalid.connection.dispose();
});

test("plugin conversation lists contain only owned metadata and reopen saved scenes without resupplying a profile", async () => {
  fake.record = null;
  const f = pluginFixture();
  const session = await f.client.createSession(pluginInput);
  const sent = await session.send({ text: "saved conversation" });
  completeTask(sent.taskId!);
  await session.flush();
  const origin = { kind: "plugin", pluginId: "plugin", sceneId: "debug" };
  const own = {
    id: session.identity.id,
    path: "/private/path",
    title: "Saved plugin conversation",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 2,
    workspaceId: "workspace",
    origin,
  };
  fake.metas = [
    own,
    { ...own, id: "ordinary", origin: { kind: "builtin", sceneId: "chat" }, title: "private ordinary chat" },
    { ...own, origin: { ...origin, pluginId: "other" }, title: "private other plugin" },
    { ...own, workspaceId: "other", title: "private other workspace" },
    { ...own, origin: { ...origin, sceneId: "" }, title: "invalid scene" },
  ];
  fake.failLoad = true;
  const summaries = await f.client.listSessions({ workspaceId: "workspace" });
  fake.failLoad = false;
  assert.deepEqual(summaries, [
    { chatId: session.identity.id, sceneId: "debug", title: own.title, createdAt: 1, updatedAt: 2, messageCount: 2 },
  ]);
  assert.doesNotMatch(JSON.stringify(summaries), /private|forged|scope|profile|apiKey|pluginId/);
  await f.service.closeAll();
  const reopened = await f.client.openSession({ workspaceId: "workspace", chatId: summaries[0].chatId });
  assert.deepEqual(reopened.identity, session.identity);
  assert.equal(reopened.getSnapshot().messages.length, 2);
  await f.service.closeAll();
  const listGate = deferred<any[]>();
  fake.list = () => listGate.promise;
  const listing = f.client.listSessions({ workspaceId: "workspace" });
  await tick();
  f.revoke();
  listGate.resolve([own]);
  await assert.rejects(listing, /permission revoked/);
  await assert.rejects(
    f.client.openSession({ workspaceId: "workspace", chatId: session.identity.id }),
    /permission revoked/,
  );
  fake.list = undefined;
  fake.metas = [];
  f.connection.dispose();
});

test("builtin origins survive saves and history never replaces a different or missing scene", async () => {
  fake.record = null;
  const service = createDesktopChatService();
  const input = historyInput("builtin-record");
  const session = await service.openSession(input);
  const sent = await session.send({ text: "builtin history" });
  completeTask(sent.taskId!);
  await session.flush();
  assert.deepEqual(fake.record.origin, { kind: "builtin", sceneId: "chat" });
  assert.equal(fake.record.workspaceId, input.workspaceId);
  assert.equal(fake.record.options.profile, undefined);
  assert.equal((await service.openRecord(input)).session, session);
  await assert.rejects(service.openSession({ ...input, origin: { kind: "builtin", sceneId: "other" } }), /来源不匹配/);
  await assert.rejects(service.openSession({ ...input, workspaceId: "other" }), /来源不匹配/);
  await service.closeAll();
  const saved = structuredClone(fake.record);
  for (const origin of [{ kind: "builtin", sceneId: "unavailable" }, undefined]) {
    fake.record = { ...saved, origin };
    const next = createDesktopChatService();
    const runs = fake.runs.length;
    const writes = fake.writes.length;
    const view = await next.openRecord(input);
    assert.equal(view.session, undefined);
    assert.deepEqual(view.history!.messages, saved.messages);
    assert.equal(view.history!.canRetry, false);
    assert.equal(next.listSessions().length, 0);
    assert.equal(fake.runs.length, runs);
    assert.equal(fake.writes.length, writes);
  }
  fake.record = null;
});

test("desktop ownership rolls back failed opens and record observers only follow their physical record", async () => {
  fake.record = null;
  const service = createDesktopChatService();
  const input = historyInput("owned-record");
  let changes = 0;
  const detach = service.subscribeRecord(input, () => changes++);
  fake.failLoad = true;
  await assert.rejects(service.openSession(input), /broken file/);
  assert.equal(service.listSessions().length, 0);
  assert.equal(changes, 0, "failed opening does not trigger an automatic retry loop");
  fake.failLoad = false;
  const pending = service.openSession(input);
  assert.equal(service.openSession(input), pending, "concurrent opens share one reservation and promise");
  await assert.rejects(
    service.openSession({ ...input, identity: { ...input.identity, scope: "other" } }),
    /作用域持有/,
  );
  const session = await pending;
  assert.equal(changes, 1);
  assert.deepEqual(Object.keys(service.viewPersistence(session)!).sort(), ["loadPreferences", "savePreferences"]);
  const other = await service.openSession({
    ...input,
    workspacePath: "other-path",
    identity: { ...input.identity, scope: "other" },
  });
  assert.equal(changes, 1, "same chat ID in another workspace does not notify this record");
  await service.closeSession(other.identity);
  assert.equal(changes, 1);
  await service.closeSession(session.identity);
  assert.equal(changes, 1, "explicit close cannot ask a mounted view to reopen the session");
  detach();
  service.invalidateRecords();
  assert.equal(changes, 1);
});
