import test from "node:test";
import assert from "node:assert/strict";
import { fake } from "./fixtures/api";
import { createDesktopCatalog } from "../../src/chat/desktop/catalog";
import { createDesktopStorage } from "../../src/chat/desktop/storage";
import { createDesktopChatService } from "../../src/chat/desktop/service";
import { summarizeChatLedger } from "../../src/chat/desktop/ledger";
import { getLlmSettings, getLlmModelOptions, resolveLlmModel, saveLlmSettings } from "../../src/api/llm";

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
  assert.doesNotMatch(
    JSON.stringify(data),
    /apiKey|runtimeModel|secret-must-not-reach-ui|private skill body|\/skills\/private/,
  );
});
test("legacy record codec preserves options and serializes view/config/unread changes", async () => {
  fake.record = {
    id: "old",
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
      selectedToolNames: [],
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
  assert.deepEqual(record!.config!.selectedToolNames, []);
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
  const input = { identity, workspacePath: "fixture", profile };
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
  const input = { workspacePath: "fixture", profile: { id: "workspace", systemPrompt: () => "" } };
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
