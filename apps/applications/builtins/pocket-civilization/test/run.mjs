import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "pocket-test-"));
const entry = join(temporary, "fixture.mjs");
await build({
  stdin: { contents: 'export * from "./main/model.ts"; export * from "./main/intelligence.ts"; export * from "./main/repository.ts"; export { evaluate as pluginEvaluate, formatDecision } from "../../../extensions/decisions/src/evaluate.ts";', resolveDir: root },
  bundle: true, platform: "node", format: "esm", target: "node22", outfile: entry, logLevel: "silent",
});
const f = await import(pathToFileURL(entry).href);
after(() => rm(temporary, { recursive: true, force: true }));

function memoryStorage() {
  const values = new Map();
  return {
    values, fail: false,
    async getItem(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async setItem(key, value) { if (this.fail) throw new Error("disk full"); values.set(key, structuredClone(value)); },
    async removeItem(key) { values.delete(key); },
    async clear() { values.clear(); },
    async keys() { return [...values.keys()]; },
  };
}

test("writing a law schedules tomorrow, withdrawing preserves today and history", () => {
  const world = f.createWorld(), original = structuredClone(world);
  const law = f.interpretStoryLaw("说真话的人，身边会开花。", 8);
  const pending = f.scheduleLaw(world, law);
  assert.equal(pending.day, 7);
  assert.equal(pending.law.id, world.law.id);
  assert.equal(pending.pendingLaw.since, 8);
  assert.deepEqual(pending.events, original.events);
  assert.equal(f.withdrawLaw(pending).pendingLaw, null);
  assert.deepEqual(world, original);
  const tomorrow = f.applyPlan(pending, f.planStoryDay(pending));
  assert.equal(tomorrow.day, 8);
  assert.equal(tomorrow.law.id, law.id);
  assert.equal(tomorrow.pendingLaw, null);
  assert.deepEqual(tomorrow.events.slice(0, 3), original.events);
  assert.equal(tomorrow.events.find(e => e.day === 8 && e.residentId === "atuan").effect, "flowers");
});

test("a stale plan and story judgments cannot overwrite an intelligent world", () => {
  const world = f.createWorld(), plan = f.planStoryDay(world);
  assert.throws(() => f.applyPlan({ ...world, revision: 1 }, plan), /旧的演绎/);
  assert.throws(() => f.applyPlan({ ...world, mode: "intelligent" }, plan), /实际插件判断/);
  assert.equal(world.day, 7);
});

test("ambiguous, negative and combined story laws are not silently simplified", () => {
  for (const text of ["说谎不会下雨。", "真话开花，谎言下雨。", "只有善意的谎言才会下雨。", "下雨吧", "大家都要快乐"]) assert.throws(() => f.interpretStoryLaw(text, 8), /复杂/);
  assert.throws(() => f.lawFromChoice("test", "toString", 8), /无法明确/);
  assert.throws(() => f.validateWorld({ ...f.createWorld(), law: { ...f.createWorld().law, trigger: "toString" } }), /法则存档/);
});

test("petitions leave an interpretation for tomorrow and affect repeated truths", () => {
  let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("说真话的人，身边会开花。", 8));
  world = f.applyPlan(world, f.planStoryDay(world));
  world = f.applyPlan(world, f.planStoryDay(world));
  const petition = world.petitions.find(p => !p.resolution);
  assert.ok(petition);
  const resolved = f.resolvePetition(world, petition.id, "once");
  assert.equal(resolved.interpretation, null);
  assert.equal(resolved.pendingInterpretation, "once");
  const tomorrow = f.applyPlan(resolved, f.planStoryDay(resolved));
  assert.equal(tomorrow.interpretation, "once");
  assert.equal(tomorrow.pendingInterpretation, null);
  assert.equal(tomorrow.events.findLast(e => e.residentId === "xiaoman").effect, null);
  assert.throws(() => f.resolvePetition(resolved, petition.id, "always"), /已经处理/);
  const changedLaw = f.scheduleLaw(tomorrow, f.interpretStoryLaw("说真话的人，脚边开花。", tomorrow.day + 1));
  const newPlan = f.planStoryDay(changedLaw);
  assert.equal(newPlan.events.find(e => e.residentId === "atuan").effect, "flowers");
});

test("save failure and stale writes preserve the previous saved day", async () => {
  const storage = memoryStorage(), repository = new f.WorldRepository(storage);
  const world = await repository.load();
  const next = f.applyPlan(world, f.planStoryDay(world));
  storage.fail = true;
  await assert.rejects(repository.save(next, world.revision), /disk full/);
  assert.equal((await repository.load()).day, 7);
  storage.fail = false;
  await repository.save(next, world.revision);
  assert.equal((await repository.load()).day, 8);
  await assert.rejects(repository.save(next, world.revision), /另一个页面/);
  assert.equal((await repository.load()).day, 8);
});

test("petitions and tomorrow's explanations stay scoped to the law they describe", () => {
  let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("说真话的人，身边会开花。", 8));
  world = f.applyPlan(world, f.planStoryDay(world));
  world = f.applyPlan(world, f.planStoryDay(world));
  const petition = world.petitions[0];
  assert.equal(petition.lawId, world.law.id);
  const resolved = f.resolvePetition(world, petition.id, "once");
  const pending = f.scheduleLaw(resolved, f.interpretStoryLaw("帮助别人的人，头顶会下雨。", 10));
  assert.equal(f.effectiveInterpretation(pending), null);
  assert.equal(f.effectiveInterpretation(f.withdrawLaw(pending)), "once");
  const next = f.applyPlan(pending, f.planStoryDay(pending));
  assert.equal(next.interpretation, null);
  assert.equal(next.petitions[0].lawId, world.law.id, "old petition remains historical");
  assert.throws(() => f.resolvePetition(f.scheduleLaw(world, pending.pendingLaw), petition.id, "always"), /之前的法则/);
  const unresolved = f.applyPlan(f.scheduleLaw(world, pending.pendingLaw), f.planStoryDay(f.scheduleLaw(world, pending.pendingLaw)));
  assert.throws(() => f.resolvePetition(unresolved, petition.id, "once"), /之前的法则/);
});

test("corrupt saves are reported without resetting or overwriting the stored value", async () => {
  const storage = memoryStorage();
  const bad = { ...f.createWorld(), day: -1 };
  await storage.setItem(f.WORLD_KEY, bad);
  await assert.rejects(new f.WorldRepository(storage).load(), /存档/);
  assert.deepEqual(await storage.getItem(f.WORLD_KEY), bad);
});

test("plugin result status and value remain distinct, including abstention", () => {
  const options = ["触发法则", "不触发法则", "存在解释争议"];
  const render = (value, status) => f.formatDecision({ type: "choice", value, status, reason: "依据明确的材料。" });
  assert.equal(f.parseDecisionText(render("不触发法则", "accepted"), options).value, "不触发法则");
  assert.equal(f.parseDecisionText(render("触发法则", "review_required"), options).status, "review_required");
  assert.equal(f.parseDecisionText(render(null, "abstained"), options).value, null);
  assert.throws(() => f.parseDecisionText(render("未约定选项", "accepted"), options), /约定之外/);
  assert.throws(() => f.parseDecisionText("这是模型自己写的一段故事", options), /完整的判断格式/);
  const world = f.createWorld();
  assert.throws(() => f.makePlan(world, [f.storyActions(world, world.law)[0]], [{ source: "plugin", status: "review_required", value: "触发法则", reason: "信息有待复核。" }]), /尚未推进/);
});

function intelligentFixture({ plugin = true, review = false } = {}) {
  const storage = memoryStorage(), calls = [], modelRequests = [], listeners = new Set();
  const snapshot = {
    initialized: true, identity: { scope: "application:pocket", id: "pocket-test" }, phase: "idle", activeTaskId: null,
    messages: [], error: "", initializationError: "", pendingQuestion: null,
    config: { selectedModelId: "local-test" },
    resources: { commands: plugin ? [{ id: "mewvis.decisions/ready" }] : [] },
  };
  const publish = () => { for (const listener of listeners) listener(); };
  const host = {
    supports: capability => capability === "tasks.run",
    tasks: { async run(input) {
      modelRequests.push(input);
      assert.equal(input.tools, "none");
      if (input.title.includes("匹配")) return { text: JSON.stringify({ matches: [] }) };
      const material = JSON.parse(JSON.parse(input.text).input);
      const value = material.法则原文 ? "真话开花" : material.action.kind === "confess" ? "触发法则" : "不触发法则";
      return { text: JSON.stringify({ type: "choice", value, confidence: review ? .2 : .99, reason: "根据提供的法则和明确事实判断。" }) };
    } },
  };
  const session = {
    identity: snapshot.identity,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async refreshResources() {},
    async updateConfig(patch) { Object.assign(snapshot.config, patch); return { ok: true }; },
    async send(input) {
      calls.push(input.text);
      snapshot.phase = "running"; snapshot.activeTaskId = crypto.randomUUID();
      snapshot.messages.push({ id: crypto.randomUUID(), role: "user", blocks: [{ type: "text", content: input.text }] });
      publish();
      let text;
      if (input.text.startsWith("/mewvis.decisions/evaluate ")) {
        const request = JSON.parse(input.text.slice(input.text.indexOf(" ") + 1));
        const result = await f.pluginEvaluate(request, [], host, new AbortController().signal);
        text = f.formatDecision(result);
      } else {
        text = JSON.stringify({ actions: [
          { residentId: "atuan", kind: "confess", text: "阿团承认面包是自己吃的。", speech: "是我吃的。" },
          { residentId: "xiaoman", kind: "trade", text: "小满开始整理店里的雨伞。", speech: "今天也开门。" },
          { residentId: "gardener", kind: "help", text: "青禾帮小满把花盆搬到店门边。", speech: "这里正好有阳光。" },
        ] });
      }
      snapshot.messages.push({ id: crypto.randomUUID(), role: "assistant", status: "done", blocks: [{ type: "text", content: text }] });
      snapshot.phase = "idle"; snapshot.activeTaskId = null; publish();
      return { status: "dispatched" };
    },
    async stop() { return { ok: true }; },
  };
  const chat = { async listModels() { return [{ id: "local-test", provider: { name: "Local" }, modelName: "Fixture" }]; }, async createSession() { return session; }, async openSession() { return session; }, dispose() {} };
  const data = { storage, workspaces: { async list() { return [{ id: "pocket-workspace", isDefault: true }]; } } };
  return { intelligence: new f.IslandIntelligence(chat, data), calls, modelRequests, session };
}

test("application orchestration consumes actual decisions-plugin output through existing command format", async () => {
  const fixture = intelligentFixture();
  await fixture.intelligence.connect();
  const signal = new AbortController().signal;
  const law = await fixture.intelligence.interpretLaw("说真话的人，身边会开花。", 8, signal);
  let world = f.scheduleLaw({ ...f.createWorld(), mode: "intelligent" }, law);
  const plan = await fixture.intelligence.planDay(world, signal, () => {});
  world = f.applyPlan(world, plan);
  assert.equal(world.day, 8);
  assert.equal(plan.events[0].effect, "flowers");
  assert.equal(plan.events[1].effect, null);
  assert.ok(plan.events.every(event => event.judgment.source === "plugin"));
  assert.equal(fixture.calls.filter(text => text.startsWith("/mewvis.decisions/evaluate ")).length, 4);
  assert.equal(fixture.modelRequests.length, 8, "four real plugin evaluations each match then judge");
});

test("missing plugin and low-confidence judgments never turn into fixed story success", async () => {
  const missing = intelligentFixture({ plugin: false });
  await assert.rejects(missing.intelligence.connect(), /尚未启用/);
  assert.equal(missing.calls.length, 0);
  const review = intelligentFixture({ review: true });
  await review.intelligence.connect();
  const world = { ...f.createWorld(), mode: "intelligent" };
  await assert.rejects(review.intelligence.planDay(world, new AbortController().signal, () => {}), /尚未推进/);
  assert.equal(world.day, 7);
});

test("cancelling a pending turn stops its session and releases the observer", async () => {
  const listeners = new Set(); let stopped = 0;
  const session = {
    getSnapshot: () => ({ messages: [], phase: "running", activeTaskId: "pending" }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async send() { return { status: "dispatched" }; },
    async stop() { stopped++; return { ok: true }; },
  };
  const controller = new AbortController();
  const pending = f.runSessionText(session, "test", controller.signal);
  controller.abort();
  await assert.rejects(pending, /已停止/);
  assert.equal(stopped, 1);
  assert.equal(listeners.size, 0);
});

test("host approval stays visible while a judgment waits, without approving in the application", async () => {
  const listeners = new Set(); let waits = 0, stopped = 0;
  const snapshot = { messages: [], phase: "running", activeTaskId: "judgment", pendingApproval: { approvalId: "host-only" } };
  const session = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async send() { return { status: "dispatched" }; },
    async stop() { stopped++; return { ok: true }; },
  };
  const controller = new AbortController();
  const pending = f.runSessionText(session, "judgment", controller.signal, 5000, () => waits++);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(waits, 1);
  for (const listener of listeners) listener();
  assert.equal(waits, 1, "one prompt per host approval");
  assert.equal(stopped, 0, "waiting for existing host UI does not cancel or approve");
  snapshot.pendingApproval = null;
  snapshot.messages.push({ id: "result", role: "assistant", status: "done", blocks: [{ type: "text", content: "host-approved result" }] });
  snapshot.phase = "idle"; snapshot.activeTaskId = null;
  for (const listener of listeners) listener();
  assert.equal(await pending, "host-approved result");
  assert.equal(listeners.size, 0);
});
