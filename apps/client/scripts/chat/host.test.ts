import test from "node:test";
import assert from "node:assert/strict";
import { fake, unreadUpdates } from "./fixtures/api";
import { useWorkspaceStore } from "../../src/workbench/pages/chats/workspace-store";
import type { Workspace } from "../../src/api/workspace";
import { createDesktopCatalog } from "../../src/chat/desktop/catalog";
import { createDesktopStorage } from "../../src/chat/desktop/storage";
import {
  createDesktopChatService,
  type DesktopChatService,
  type DesktopSessionInput,
} from "../../src/chat/desktop/service";
import { getLlmSettings, getLlmModelOptions, resolveLlmModel, saveLlmSettings } from "../../src/api/llm";
import {
  applyApiFormatDefaults,
  applyProviderDefaults,
  createModelConfig,
  createProviderConfig,
  normalizeLlmSettingsConfig,
  toLlmSettingsConfig,
  updateProviderIdentifier,
  validateLlmSettingsConfig,
} from "../../src/workbench/pages/settings/llm/edit/utils";
import {
  getDefaultApiFormat,
  getProviderApiFormats,
  getProviderModelOptions,
  getProviderOptions,
  inferApiEndpoint,
} from "../../src/workbench/pages/settings/llm/options";
import { buildRuntimeModelInputs, buildRuntimeModelOptions } from "../../src/agent-client/runtime-model";
import { createApplicationChatHost } from "../../src/chat/desktop/application";
import { createApplicationChatClient, type ApplicationChatEvent } from "@isle/app-sdk/chat";
import { createApplicationToolClient } from "@isle/app-sdk/tools";
import { createAgentDraft } from "../../src/workbench/pages/agents/draft";
import type { AgentTemplate } from "../../src/workbench/pages/agents/types";

test("custom suppliers survive settings reload and remain selectable with their own connection and thinking", () => {
  const configured = createProviderConfig(true);
  configured.provider = "my-proxy";
  configured.name = "私有网关";
  configured.apiKey = "custom-fixture-key";
  configured.apiEndpoint = "https://gateway.invalid/v1";
  configured.apiFormat = "openai-completions";
  configured.models = [
    {
      ...createModelConfig(),
      modelId: "custom-model",
      modelName: "Custom model",
      thinking: { levels: [{ value: "custom", label: "Custom" }], defaultLevel: "custom" },
    },
  ];
  const persisted = {
    ...configured,
    createdAt: 1,
    updatedAt: 2,
    models: configured.models.map((model) => ({ ...model, providerId: configured.id, createdAt: 1, updatedAt: 2 })),
  };
  const draft = toLlmSettingsConfig({ providers: [persisted] });
  assert.deepEqual(draft.providers[0], configured);
  assert.equal(validateLlmSettingsConfig(normalizeLlmSettingsConfig(draft)), "");
  assert.equal(buildRuntimeModelOptions({ providers: [persisted] })[0].modelId, "custom-model");
  const runtime = buildRuntimeModelInputs({ providers: [persisted] })[configured.models[0].id];
  assert.equal(runtime.provider, "my-proxy");
  assert.equal(runtime.apiEndpoint, configured.apiEndpoint);
  assert.equal(runtime.thinkingLevel, "custom");
  assert.equal(getDefaultApiFormat("my-proxy"), "openai-completions");
  assert.ok(getProviderApiFormats("my-proxy").includes("anthropic-messages"));
  assert.ok(getProviderApiFormats("my-proxy").includes("openai-responses"));
  const invalid = structuredClone(draft);
  invalid.providers[0].apiEndpoint = "";
  assert.match(validateLlmSettingsConfig(invalid), /API Endpoint/);
  invalid.providers[0] = { ...configured, provider: " " };
  assert.equal(validateLlmSettingsConfig(invalid), "供应商不能为空");
  const prototypeNamed = { providers: [{ ...persisted, provider: "constructor" }] };
  assert.equal(toLlmSettingsConfig(prototypeNamed).providers[0].provider, "constructor");
  assert.equal(buildRuntimeModelOptions(prototypeNamed).length, 1);
});

test("typing supplier identifiers and changing custom API formats preserve manually configured fields", () => {
  const original = createProviderConfig(false);
  original.name = "手动配置";
  original.apiKey = "fixture-key";
  original.apiEndpoint = "https://gateway.invalid/custom";
  original.models = [{ ...createModelConfig(), modelId: "manual-model", modelName: "Manual model" }];
  let draft = original;
  for (const supplier of ["m", "my-", "my-proxy"]) draft = updateProviderIdentifier(draft, supplier);
  assert.equal(draft.provider, "my-proxy");
  assert.equal(draft.name, original.name);
  assert.equal(draft.apiKey, original.apiKey);
  assert.equal(draft.apiEndpoint, original.apiEndpoint);
  assert.deepEqual(draft.models, original.models);
  const changed = applyApiFormatDefaults(draft, "anthropic-messages");
  assert.equal(changed.apiFormat, "anthropic-messages");
  assert.equal(changed.apiEndpoint, original.apiEndpoint);
  assert.deepEqual(changed.models, original.models);
  assert.equal(updateProviderIdentifier(createProviderConfig(false), "my-proxy").name, "my-proxy");
});

test("selecting a supplier preset still applies its API, endpoint and initial model", () => {
  const original = createProviderConfig(false);
  original.apiKey = "fixture-key";
  const next = getProviderOptions().find((option) => option.value !== original.provider)!;
  const updated = applyProviderDefaults(original, next.value);
  assert.equal(updated.provider, next.value);
  assert.equal(updated.apiFormat, getDefaultApiFormat(next.value));
  assert.equal(updated.apiEndpoint, inferApiEndpoint(next.value, updated.apiFormat));
  assert.equal(updated.models[0].modelId, getProviderModelOptions(next.value)[0].id);
  assert.equal(updated.apiKey, original.apiKey);
});

test("creating an agent from a system configuration strips identity and makes independent editable lists", () => {
  const template: AgentTemplate = {
    id: "template:reviewer",
    name: "代码审查员",
    avatar: "cat-graphite",
    summary: "审查代码",
    category: "研发",
    instructions: "检查边界条件",
    useCases: ["审查"],
    starterPrompts: ["审查这个改动"],
    skillKeys: ["review"],
    toolNames: ["read_file"],
    knowledgeCollectionIds: ["standards"],
    references: [{ name: "Source", url: "https://example.com" }],
  };
  const original = structuredClone(template);
  const first = createAgentDraft(template);
  assert.equal(first.name, template.name);
  assert.equal(first.instructions, template.instructions);
  assert.ok(!("id" in first) && !("references" in first) && !("templateId" in first));
  first.name = "我的审查员";
  for (const key of ["useCases", "starterPrompts", "skillKeys", "toolNames", "knowledgeCollectionIds"] as const)
    first[key].push("custom");
  assert.deepEqual(template, original);
  const { id: _id, references: _references, ...expected } = original;
  assert.deepEqual(createAgentDraft(template), expected);
});

test("creating from blank does not reuse the previously selected configuration", () => {
  const blank = createAgentDraft();
  assert.equal(blank.name, "");
  assert.equal(blank.instructions, "");
  assert.equal(blank.category, "自定义");
  assert.equal(blank.avatar, "agent-office");
  assert.deepEqual(blank.skillKeys, []);
  assert.deepEqual(blank.toolNames, []);
  assert.deepEqual(blank.knowledgeCollectionIds, []);
});

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
const applicationInput = {
  workspaceId: "workspace",
  sceneId: "debug",
  profile: {
    id: "application-scene",
    systemPrompt: "Keep the application scene",
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
function applicationFixture(availableTools = ["own"]) {
  const service = createDesktopChatService({ resolveRecord: (...args) => host.resolveSession(...args) });
  let allowed = true;
  const host = createApplicationChatHost(service, {
    tools: async () => availableTools,
    authorize: async () => {
      if (!allowed) throw new Error("permission revoked");
      return { workspacePath: "fixture", knowledge: true };
    },
  });
  const listeners = new Set<(event: ApplicationChatEvent) => void>();
  const connection = host.connect("application", ["own"], (event) => listeners.forEach((listener) => listener(event)));
  const client = createApplicationChatClient({
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

test("catalog and model resolution share one cold read; callers cannot mutate the cache", async () => {
  const before = fake.llmReads;
  const [settings, options, model] = await Promise.all([
    getLlmSettings(),
    getLlmModelOptions(),
    resolveLlmModel("model"),
  ]);
  assert.equal(fake.llmReads - before, 1);
  assert.equal(model.apiKey, "secret-must-not-reach-ui");
  assert.doesNotMatch(JSON.stringify(options), /apiKey|secret-must-not-reach-ui/);
  settings.providers[0].apiKey = "caller mutation";
  model.apiKey = "another mutation";
  assert.equal((await resolveLlmModel("model")).apiKey, "secret-must-not-reach-ui");
  assert.equal(fake.llmReads - before, 1);
});

test("model catalog drives host and application thinking selection, request payloads and persisted sessions", async () => {
  const previous = structuredClone(fake.llmSettings);
  const fixture = applicationFixture();
  fake.record = null;
  try {
    fake.llmSettings = {
      providers: [
        {
          ...previous.providers[0],
          provider: "deepseek",
          models: [{ id: "model", modelId: "deepseek-v4-pro", modelName: "DeepSeek" }],
        },
      ],
    };
    await getLlmSettings({ refresh: true });
    const options = await getLlmModelOptions();
    assert.deepEqual(
      options[0].thinking?.levels.map((option) => option.value),
      ["off", "low", "high", "max"],
    );
    assert.equal((await resolveLlmModel("model")).thinkingLevel, "high");
    assert.equal((await resolveLlmModel("model", "off")).thinkingLevel, "off");
    assert.equal((await resolveLlmModel("model", "provider-custom")).thinkingLevel, "provider-custom");
    assert.equal((await resolveLlmModel("model", null)).thinkingLevel, null);
    const custom = { levels: [{ value: "provider-custom", label: "自定义深度" }], defaultLevel: "provider-custom" };
    const draft = toLlmSettingsConfig(fake.llmSettings);
    draft.providers[0].models[0].thinking = custom;
    await saveLlmSettings(normalizeLlmSettingsConfig(draft));
    assert.deepEqual(toLlmSettingsConfig(await getLlmSettings()).providers[0].models[0].thinking, custom);
    assert.deepEqual((await getLlmModelOptions())[0].thinking, custom);
    assert.equal((await resolveLlmModel("model")).thinkingLevel, "provider-custom");
    const application = await fixture.client.createSession(applicationInput);
    assert.equal(application.getSnapshot().config.thinkingLevel, "provider-custom");
    assert.deepEqual(application.getSnapshot().resources.models?.[0].thinking, custom);
    assert.equal((await application.updateConfig({ thinkingLevel: "future-effort" })).ok, true);
    assert.equal((await application.updateConfig({ thinkingLevel: "provider-custom" })).ok, true);
    const sent = await application.send({ text: "selected effort" });
    assert.equal(sent.status, "dispatched");
    assert.equal(fake.runs.at(-1).runtimeModel.thinkingLevel, "provider-custom");
    completeTask(sent.taskId!);
    await application.flush();
    assert.equal(fake.record.options.thinkingLevel, "provider-custom");
    await fixture.service.closeAll();
    const restored = await openHistorySession(fixture.service, historyInput(application.identity.id));
    assert.equal(restored.getSnapshot().config.thinkingLevel, "provider-custom");
    draft.providers[0].models[0].thinking = { levels: [], defaultLevel: null };
    await saveLlmSettings(normalizeLlmSettingsConfig(draft));
    assert.deepEqual((await getLlmModelOptions())[0].thinking?.levels, []);
    assert.equal((await resolveLlmModel("model")).thinkingLevel, undefined);
  } finally {
    await fixture.service.closeAll();
    fake.llmSettings = previous;
    fake.record = null;
    await getLlmSettings({ refresh: true });
  }
});

test("resource loading tolerates tools failure; UI descriptors contain no runtime secrets or skill bodies", async () => {
  const client = {
    capabilities: {
      async listAgentTools() {
        throw new Error("application schema failure");
      },
    },
  };
  const catalog = createDesktopCatalog(client as any, () => ({ id: "workspace", systemPrompt: () => "" }));
  const data = await catalog.load();
  assert.equal(data.models?.length, 1);
  assert.deepEqual(data.agents, []);
  assert.equal(data.skillGroups?.[0].skills.length, 1);
  assert.equal(data.knowledgeCollections?.length, 1);
  assert.match(data.errors?.tools ?? "", /工具/);
  assert.deepEqual(data.permissionOptions, []);
  assert.doesNotMatch(
    JSON.stringify(data),
    /apiKey|runtimeModel|secret-must-not-reach-ui|private skill body|\/skills\/private/,
  );
});
test("application selection, restoration and dispatch use the same permission modes as the host", async () => {
  fake.record = null;
  const first = applicationFixture(["own", "host"]);
  const second = applicationFixture(["own", "host"]);
  try {
    const application = await first.client.createSession({
      ...applicationInput,
      profile: { ...applicationInput.profile, allowedToolNames: ["own", "host"] },
    });
    assert.equal((await application.updateConfig({ permissionMode: "full" })).ok, true);
    const sent = await application.send({ text: "use assigned tools" });
    assert.equal(sent.status, "dispatched");
    assert.deepEqual(fake.runs.at(-1).permissions, { mode: "full" });
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, ["own", "host"]);
    assert.equal(fake.runs.at(-1).applicationId, "application");
    completeTask(sent.taskId!);
    await application.flush();
    await first.service.closeAll();
    const restored = await openHistorySession(second.service, historyInput(application.identity.id));
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
  assert.equal(fake.llmReads, readsAfterOpen, "sending reuses the catalog configuration");
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
  updated.providers[0].models = [];
  await saveLlmSettings(updated);
  assert.deepEqual(await getLlmModelOptions(), []);
  await assert.rejects(resolveLlmModel("model"), /不可用/);
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

test("completed application chats open from history as the same owner and retain scene, permissions and save queue", async () => {
  fake.record = null;
  fake.runs = [];
  const f = applicationFixture();
  const application = await f.client.createSession(applicationInput);
  await application.setContext({ requestContext: "updated scene" });
  const sent = await application.send({ text: "first turn" });
  assert.equal(sent.status, "dispatched");
  completeTask(sent.taskId!);
  await application.flush();
  const owner = f.service.getSession(application.identity)!;
  assert.equal(owner.getSnapshot().phase, "idle");
  const [first, second] = await Promise.all([
    openHistorySession(f.service, historyInput(application.identity.id)),
    openHistorySession(f.service, historyInput(application.identity.id)),
  ]);
  assert.equal(first, owner);
  assert.equal(second, owner);
  assert.equal(f.service.listSessions().length, 1);
  assert.deepEqual(
    owner.getSnapshot().resources.tools?.map((tool) => tool.value),
    ["own"],
  );
  const next = await first.send({ text: "continue from sidebar" });
  assert.match(fake.runs.at(-1).systemPrompt, /Keep the application scene/);
  assert.match(fake.runs.at(-1).requestContext, /updated scene/);
  assert.equal(
    await openHistorySession(f.service, historyInput(application.identity.id)),
    owner,
    "running views also share the owner",
  );
  await assert.rejects(f.service.openSession(historyInput(application.identity.id)), /来源不匹配/);
  completeTask(next.taskId!);
  await owner.flush();
  f.revoke();
  const view = await f.service.openRecord(historyInput(application.identity.id));
  assert.equal(view.session, undefined);
  assert.deepEqual(view.history!.messages, owner.getSnapshot().messages);
  assert.equal((await owner.send({ text: "not authorized" })).status, "rejected");
  assert.equal(fake.runs.length, 2);
  fake.failSave = true;
  await assert.rejects(
    f.service.viewPersistence(owner)!.savePreferences({ showThinkingProcess: false, showToolCallProcess: true }),
  );
  assert.equal((await f.service.closeRecord("fixture", application.identity.id)).ok, false);
  assert.equal(f.service.getSession(application.identity), owner, "failed saves retain ownership");
  fake.failSave = false;
  assert.equal((await f.service.closeRecord("fixture", application.identity.id)).ok, true);
  assert.equal(f.service.listSessions().length, 0);
  f.connection.dispose();
});

test("history restores application ownership and dynamic context after restart, including later application reconnection", async () => {
  fake.record = null;
  const first = applicationFixture();
  const application = await first.client.createSession(applicationInput);
  const sent = await application.send({ text: "remember" });
  completeTask(sent.taskId!);
  await application.flush();
  await application.setContext({ requestContext: "persisted after the last turn" });
  await application.updateConfig({ selectedSkillKeys: [], selectedKnowledgeCollectionIds: [], permissionMode: "ask" });
  await application.flush();
  await first.service.closeAll();
  first.connection.dispose();
  const saved = structuredClone(fake.record);
  assert.deepEqual(saved.origin, { kind: "application", applicationId: "application", sceneId: "debug" });
  assert.equal(saved.workspaceId, "workspace");
  assert.equal(saved.options.chatOrigin, undefined);
  assert.equal(saved.options.profile.id, applicationInput.profile.id);
  assert.doesNotMatch(
    JSON.stringify({ workspaceId: saved.workspaceId, origin: saved.origin, profile: saved.options.profile }),
    /apiKey|runtimeModel|secret-must-not-reach-ui/,
  );
  const second = applicationFixture();
  const [a, b] = await Promise.all([
    openHistorySession(second.service, historyInput(application.identity.id)),
    openHistorySession(second.service, historyInput(application.identity.id)),
  ]);
  assert.equal(a, b);
  assert.deepEqual(a.identity, application.identity);
  assert.deepEqual(a.getSnapshot().config.selectedSkillKeys, []);
  assert.deepEqual(a.getSnapshot().config.permissionMode, "ask");
  assert.deepEqual(a.getSnapshot().config.selectedKnowledgeCollectionIds, []);
  assert.equal(a.getSnapshot().messages.length, saved.messages.length);
  const reconnect = await second.client.openSession({ workspaceId: "workspace", chatId: application.identity.id });
  assert.equal(second.service.getSession(reconnect.identity), a);
  const sentAgain = await reconnect.send({ text: "continue after restart" });
  assert.equal(
    fake.runs.at(-1).applicationId,
    "application",
    "restoring from host history preserves the application owner",
  );
  assert.match(fake.runs.at(-1).requestContext, /persisted after the last turn/);
  completeTask(sentAgain.taskId!);
  await second.service.closeAll();
  second.connection.dispose();

  const applicationFirst = applicationFixture();
  const connectedFirst = await applicationFirst.client.openSession({
    workspaceId: "workspace",
    chatId: application.identity.id,
  });
  const fromApplication = await connectedFirst.send({ text: "application opens first after restart" });
  assert.match(fake.runs.at(-1).requestContext, /persisted after the last turn/);
  completeTask(fromApplication.taskId!);
  const closing = applicationFirst.service.closeRecord("fixture", application.identity.id);
  const reopening = openHistorySession(applicationFirst.service, historyInput(application.identity.id));
  assert.equal((await closing).ok, true);
  const reopened = await reopening;
  assert.deepEqual(reopened.identity, application.identity);
  assert.equal(reopened.getSnapshot().phase, "idle");
  assert.equal(
    applicationFirst.service.listSessions().length,
    1,
    "history waits for an explicit owner close before restoring",
  );
  await applicationFirst.service.closeAll();
  applicationFirst.connection.dispose();

  const denied = applicationFixture();
  denied.revoke();
  const writes = fake.writes.length;
  const subscriptions = fake.events.size;
  const runs = fake.runs.length;
  const readonly = await denied.service.openRecord(historyInput(application.identity.id));
  assert.equal(readonly.session, undefined);
  assert.match(readonly.history!.reason, /permission revoked/);
  assert.equal(readonly.history!.canRetry, true);
  assert.deepEqual(readonly.history!.messages, fake.record.messages);
  assert.equal(fake.events.size, subscriptions, "read-only history does not subscribe to a runtime");
  assert.equal(fake.writes.length, writes, "read-only history does not save or rewrite messages");
  assert.equal(fake.runs.length, runs);
  assert.equal(denied.service.listSessions().length, 0, "no workspace fallback on failed application authorization");
  denied.connection.dispose();
  const invalid = applicationFixture();
  await assert.rejects(
    invalid.host.resolveSession("other", application.identity.id, {
      workspaceId: saved.workspaceId,
      origin: saved.origin,
      profile: saved.options.profile,
    }),
    /工作区与记录不匹配/,
  );
  await assert.rejects(invalid.client.openSession({ workspaceId: "workspace", chatId: "missing" }), /未找到聊天记录/);
  saved.options.profile.allowedToolNames = ["host"];
  const stale = await invalid.host.resolveSession("fixture", application.identity.id, {
    workspaceId: saved.workspaceId,
    origin: saved.origin,
    profile: saved.options.profile,
  });
  assert.deepEqual(stale.profile.resolveToolNames?.(), [], "unavailable tools do not prevent restoring history");
  assert.equal(invalid.service.listSessions().length, 0);
  invalid.connection.dispose();
});

test("application conversation lists contain only owned metadata and reopen saved scenes without resupplying a profile", async () => {
  fake.record = null;
  const f = applicationFixture();
  const session = await f.client.createSession(applicationInput);
  const sent = await session.send({ text: "saved conversation" });
  completeTask(sent.taskId!);
  await session.flush();
  const origin = { kind: "application", applicationId: "application", sceneId: "debug" };
  const own = {
    id: session.identity.id,
    path: "/private/path",
    title: "Saved application conversation",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 2,
    workspaceId: "workspace",
    origin,
  };
  fake.metas = [
    own,
    { ...own, id: "ordinary", origin: { kind: "builtin", sceneId: "chat" }, title: "private ordinary chat" },
    { ...own, origin: { ...origin, applicationId: "other" }, title: "private other application" },
    { ...own, workspaceId: "other", title: "private other workspace" },
    { ...own, origin: { ...origin, sceneId: "" }, title: "invalid scene" },
  ];
  fake.failLoad = true;
  const summaries = await f.client.listSessions({ workspaceId: "workspace" });
  fake.failLoad = false;
  assert.deepEqual(summaries, [
    { chatId: session.identity.id, sceneId: "debug", title: own.title, createdAt: 1, updatedAt: 2, messageCount: 2 },
  ]);
  assert.doesNotMatch(JSON.stringify(summaries), /private|forged|scope|profile|apiKey|applicationId/);
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
  assert.equal(Object.hasOwn(fake.runs.at(-1), "applicationId"), false);
  assert.equal(fake.runs.at(-1).resources.applications, undefined);
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

test("LLM settings import waits for the startup migration before loading", async () => {
  const before = fake.llmReads;
  let migrated = false;
  fake.readLlm = async () => {
    assert.ok(migrated, "model queries must not run before database migration");
    return structuredClone(fake.llmSettings);
  };
  try {
    const { useLlmSettingsStore } = await import("../../src/workbench/pages/settings/llm/store");
    await tick();
    assert.equal(fake.llmReads, before, "importing a route must not start a database query");
    migrated = true;
    await useLlmSettingsStore.getState().loadSettings();
    assert.equal(fake.llmReads, before + 1);
    assert.equal(useLlmSettingsStore.getState().error, "");
    assert.deepEqual(useLlmSettingsStore.getState().settings, fake.llmSettings);
  } finally {
    fake.readLlm = undefined;
  }
});

test("user tool grants apply to SDK queries, existing scenes and every dispatch without changing saved profiles", async () => {
  fake.record = null;
  let granted = ["own", "host"];
  let fail = false;
  let onCatalog: (() => void) | undefined;
  const service = createDesktopChatService();
  const host = createApplicationChatHost(service, {
    authorize: async () => ({ workspacePath: "fixture", knowledge: true }),
    toolCatalog: async (id) => {
      assert.equal(id, "application");
      if (fail) throw new Error("cannot read grants");
      onCatalog?.();
      return ["own", "host"].map((name) => ({
        name,
        label: name,
        description: "",
        source: name === "own" ? ("application" as const) : ("host" as const),
        enabled: granted.includes(name),
      }));
    },
  });
  const listeners = new Set<(event: ApplicationChatEvent) => void>();
  const connection = host.connect("application", ["own"], (event) => listeners.forEach((listener) => listener(event)));
  const client = createApplicationChatClient({
    request: (request) => connection.request(structuredClone(request)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  try {
    const sdk = createApplicationToolClient(client);
    assert.deepEqual(
      (await sdk.list()).map((tool) => tool.name),
      ["own", "host"],
    );
    assert.equal("set" in sdk, false);
    await assert.rejects(connection.request({ method: "tools", input: { applicationId: "other" } }), /不支持/);
    const session = await client.createSession({
      ...applicationInput,
      profile: { ...applicationInput.profile, allowedToolNames: ["own", "host", "unavailable"] },
    });
    assert.deepEqual(
      session.getSnapshot().resources.tools?.map((tool) => tool.value),
      ["own", "host"],
    );
    granted = ["own"];
    assert.equal((await sdk.list()).find((tool) => tool.name === "host")?.enabled, false);
    await session.refreshResources();
    assert.deepEqual(
      session.getSnapshot().resources.tools?.map((tool) => tool.value),
      ["own"],
    );
    let sent = await session.send({ text: "A stale scene cannot restore host tools" });
    assert.equal(sent.status, "dispatched");
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, ["own"]);
    completeTask(sent.taskId!);
    await session.flush();
    assert.deepEqual(fake.record.options.profile.allowedToolNames, ["own", "host", "unavailable"]);
    granted = [];
    assert.deepEqual(await session.updateConfig({ selectedSkillKeys: ["skill"] }), { ok: true });
    sent = await session.send({ text: "Empty grants must remain empty" });
    assert.equal(sent.status, "dispatched");
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, []);
    assert.deepEqual(
      fake.runs.at(-1).resources.skills.enabled,
      ["skill"],
      "the host does not infer skill tool dependencies",
    );
    completeTask(sent.taskId!);
    await session.flush();
    granted = ["own"];
    let authorizations = 0;
    onCatalog = () => {
      if (++authorizations === 2) granted = ["host"];
    };
    sent = await session.send({ text: "Authorization changes between prepare and dispatch" });
    assert.equal(sent.status, "dispatched");
    assert.ok(authorizations >= 2);
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, ["host"]);
    onCatalog = undefined;
    completeTask(sent.taskId!);
    await session.flush();
    await service.closeAll();
    const restored = await client.openSession({ workspaceId: "workspace", chatId: session.identity.id });
    granted = ["host"];
    sent = await restored.send({ text: "Read latest grants on restored conversations" });
    assert.equal(sent.status, "dispatched");
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, ["host"]);
    completeTask(sent.taskId!);
    await restored.flush();
    const before = fake.runs.length;
    fail = true;
    await assert.rejects(sdk.list(), /cannot read grants/);
    assert.notEqual((await restored.send({ text: "Fail closed" })).status, "dispatched");
    assert.equal(fake.runs.length, before);
    fail = false;
    const automatic = await client.createSession(applicationInput);
    sent = await automatic.send({ text: "Omitting allowedToolNames still honors user grants" });
    assert.equal(sent.status, "dispatched");
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, ["host"]);
    completeTask(sent.taskId!);
    await automatic.flush();
    const unavailable = await client.createSession({
      ...applicationInput,
      profile: { ...applicationInput.profile, allowedToolNames: ["unavailable", "other-application"] },
    });
    sent = await unavailable.send({ text: "Unavailable tool names do not prevent chatting or grant access" });
    assert.equal(sent.status, "dispatched");
    assert.deepEqual(fake.runs.at(-1).resources.tools.allowed, []);
    completeTask(sent.taskId!);
  } finally {
    await service.closeAll();
    connection.dispose();
    client.dispose();
  }
});

test("background waiting transitions do not mark unread until the task settles", () => {
  const workspace: Workspace = {
    id: "status-workspace",
    name: "Status",
    path: "/status",
    description: null,
    isDefault: false,
    isPinned: false,
    order: 0,
    groupId: null,
    createdAt: 1,
    updatedAt: 1,
  };
  const chat = {
    id: "status-chat",
    title: "Status",
    path: "/status/chat",
    createdAt: 1,
    updatedAt: 1,
    messageCount: 0,
    isUnread: false,
  };
  useWorkspaceStore.setState({
    workspaces: [workspace],
    currentWorkspace: workspace,
    currentChat: null,
    chatActivityMap: {},
    chatsByWorkspaceId: { [workspace.id]: [chat] },
    openChats: [],
  });
  unreadUpdates.length = 0;
  const { setChatActivity, setCurrentChat } = useWorkspaceStore.getState();
  for (const activity of ["running", "waiting-approval", "waiting-answer", "running"] as const) {
    setChatActivity(workspace.id, chat.id, activity);
    assert.equal(useWorkspaceStore.getState().chatActivityMap[workspace.id]?.[chat.id], activity);
    assert.equal(useWorkspaceStore.getState().chatsByWorkspaceId[workspace.id][0].isUnread, false);
    assert.equal(unreadUpdates.length, 0);
  }
  setChatActivity(workspace.id, chat.id, null);
  assert.equal(useWorkspaceStore.getState().chatsByWorkspaceId[workspace.id][0].isUnread, true);
  assert.deepEqual(useWorkspaceStore.getState().chatActivityMap, {});
  assert.deepEqual(unreadUpdates, [{ workspacePath: workspace.path, chatId: chat.id, isUnread: true }]);
  setChatActivity(workspace.id, chat.id, null);
  assert.equal(unreadUpdates.length, 1);

  for (const activity of ["waiting-approval", "waiting-answer"] as const) {
    setChatActivity(workspace.id, chat.id, activity);
    setCurrentChat({ workspaceId: workspace.id, chatId: chat.id });
    assert.equal(useWorkspaceStore.getState().chatActivityMap[workspace.id]?.[chat.id], activity);
    unreadUpdates.length = 0;
    setChatActivity(workspace.id, chat.id, null);
    assert.equal(useWorkspaceStore.getState().chatsByWorkspaceId[workspace.id][0].isUnread, false);
    assert.equal(unreadUpdates.length, 0);

    setCurrentChat(null);
    setChatActivity(workspace.id, chat.id, activity);
    setChatActivity(workspace.id, chat.id, null);
    assert.equal(useWorkspaceStore.getState().chatsByWorkspaceId[workspace.id][0].isUnread, true);
    assert.equal(unreadUpdates.length, 1);
  }
});

test("opening another chat preserves running and waiting chats at the open-chat limit", () => {
  const openChats = ["approval", "answer", "running", "idle", "current"].map((chatId) => ({
    workspaceId: "workspace",
    chatId,
  }));
  useWorkspaceStore.setState({
    workspaces: [],
    currentWorkspace: null,
    currentChat: openChats[4],
    openChats,
    chatsByWorkspaceId: {},
    chatActivityMap: { workspace: { approval: "waiting-approval", answer: "waiting-answer", running: "running" } },
  });
  useWorkspaceStore.getState().openChat({ workspaceId: "workspace", chatId: "new" });
  assert.deepEqual(
    useWorkspaceStore.getState().openChats.map((chat) => chat.chatId),
    ["approval", "answer", "running", "current", "new"],
  );
});

test("added and manually created agents share one catalog, stay unselected by default, and references apply to one turn", async () => {
  const previousAgents = fake.agents;
  fake.record = null;
  const definition = {
    avatar: "cat-cream",
    category: "办公",
    summary: "Short label only",
    instructions: "OFFICE WORKING INSTRUCTIONS",
    useCases: [],
    starterPrompts: [],
    skillKeys: [],
    toolNames: [],
    knowledgeCollectionIds: [],
    createdAt: 0,
    updatedAt: 0,
  };
  fake.agents = [
    { ...definition, id: "office", name: "Office", templateId: "template:office-assistant" },
    {
      ...definition,
      id: "custom",
      name: "Research",
      templateId: null,
      instructions: "RESEARCH WORKING INSTRUCTIONS",
      skillKeys: ["skill"],
      toolNames: ["own", "outside-scene"],
      knowledgeCollectionIds: ["knowledge", "disabled-knowledge"],
    },
  ];
  const owner = createDesktopChatService();
  try {
    const session = await owner.openSession({
      ...historyInput("agent-refs"),
      profile: {
        id: "agent-test",
        systemPrompt: () => "Base scene",
        allowedToolNames: ["own"],
        context: async () => ({ systemPrompt: "Custom scene" }),
      },
    });
    assert.deepEqual(
      session.getSnapshot().resources.agents?.map((agent) => agent.value),
      ["office", "custom"],
    );
    assert.equal(session.getSnapshot().config.selectedAgentId, "");
    await session.updateConfig({
      selectedAgentId: "office",
      selectedSkillKeys: [],
      selectedKnowledgeCollectionIds: [],
    });
    const referenced = await session.send({
      text: "/Research prepare report",
      blocks: [
        { type: "agent-reference", agentId: "custom", name: "Research" },
        { type: "text", content: " prepare report" },
      ],
    });
    assert.equal(referenced.status, "dispatched");
    const run = fake.runs.at(-1);
    assert.match(run.systemPrompt, /Custom scene/);
    assert.match(run.systemPrompt, /RESEARCH WORKING INSTRUCTIONS/);
    assert.doesNotMatch(run.systemPrompt, /OFFICE WORKING INSTRUCTIONS|Short label only/);
    assert.match(run.requestContext, /private skill body/);
    assert.deepEqual(run.resources.tools.allowed, ["own"]);
    assert.deepEqual(run.resources.skills.enabled, ["skill"]);
    assert.deepEqual(fake.knowledgeQueries.at(-1).collectionIds, ["knowledge"]);
    assert.equal((session.getSnapshot().messages.at(-1) as any).agentName, "Research");
    assert.equal(session.getSnapshot().config.selectedAgentId, "office");
    await session.stop();
    await session.send({ text: "next ordinary request" });
    assert.match(fake.runs.at(-1).systemPrompt, /OFFICE WORKING INSTRUCTIONS/);
    assert.doesNotMatch(fake.runs.at(-1).requestContext, /private skill body/);
    await session.stop();
    const count = fake.runs.length;
    const deleted = await session.send({
      text: "deleted",
      blocks: [{ type: "agent-reference", agentId: "deleted", name: "Deleted" }],
    });
    assert.equal(deleted.status, "rejected");
    assert.match(deleted.reason ?? "", /已删除/);
    const multiple = await session.send({
      text: "two agents",
      blocks: [
        { type: "agent-reference", agentId: "custom", name: "Research" },
        { type: "agent-reference", agentId: "office", name: "Office" },
      ],
    });
    assert.equal(multiple.status, "rejected");
    assert.equal(fake.runs.length, count);
  } finally {
    await owner.closeAll();
    fake.agents = previousAgents;
  }
});
