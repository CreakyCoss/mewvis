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
  stdin: { contents: 'export * from "./main/model.ts"; export * from "./main/intelligence.ts"; export * from "./main/repository.ts"; export * from "./main/simulation.ts"; export * from "./main/stories.ts"; export * from "./main/day-draft.ts"; export { evaluate as pluginEvaluate, formatDecision } from "../../../extensions/decisions/src/evaluate.ts";', resolveDir: root },
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
  assert.ok(newPlan.events.length);
  const repeat = f.actionOptions(changedLaw).find(action => action.activity === "bridge-fact");
  assert.equal(f.storyJudgment(repeat, changedLaw.pendingLaw, { ...changedLaw, interpretation: f.effectiveInterpretation(changedLaw) }).value, "触发法则");
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

function act(world, residentId, activity, place) {
  const option = f.actionOptions(world).find(option => option.residentId === residentId && option.activity === activity && (!place || option.place === place));
  assert.ok(option, `${residentId} can execute ${activity}`);
  const law = world.pendingLaw ?? world.law;
  const effective = { ...world, interpretation: f.effectiveInterpretation(world) };
  return f.applyPlan(world, f.makePlan(world, [option], [f.storyJudgment(option, law, effective)]));
}

test("flowers persist through a law change, cleaning recovers materials, and crafting and trade conserve inventory", () => {
  let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("说真话的人，身边会开花。", 8));
  world = act(world, "atuan", "admit-bread");
  assert.equal(world.island.flowers.shop, 2);
  world = f.scheduleLaw(world, f.interpretStoryLaw("说谎的人，头顶会下雨。", 9));
  world = act(world, "gardener", "help-neighbor");
  assert.equal(world.island.flowers.shop, 2, "new laws do not remove existing flowers");
  const before = world.island.shop.looseFlowers;
  world = act(world, "gardener", "clear-flowers", "shop");
  assert.equal(world.island.flowers.shop, 0);
  assert.equal(world.island.shop.looseFlowers, before + 2);
  world = act(world, "xiaoman", "decorate-umbrella");
  assert.deepEqual(world.island.shop, { plainUmbrellas: 5, flowerUmbrellas: 1, looseFlowers: 2, sold: 0, coins: 0 });
  world = act(world, "xiaoman", "sell-umbrella");
  assert.deepEqual(world.island.shop, { plainUmbrellas: 5, flowerUmbrellas: 0, looseFlowers: 2, sold: 1, coins: 2 });
  world = act(world, "xiaoman", "restock-umbrella");
  assert.deepEqual(world.island.shop, { plainUmbrellas: 7, flowerUmbrellas: 0, looseFlowers: 2, sold: 1, coins: 0 });
});

test("the shopkeeper pursues her sales goal before crafting or restocking more finished stock", () => {
  const world = f.createWorld();
  world.island.shop.flowerUmbrellas = 1;
  assert.match(f.residentGoal(world.island, "xiaoman"), /卖给/);
  assert.equal(f.storyActions(world, world.law).find(action => action.residentId === "xiaoman").activity, "sell-umbrella");
  world.island.shop.plainUmbrellas = 0; world.island.shop.coins = 4;
  assert.equal(f.storyActions(world, world.law).find(action => action.residentId === "xiaoman").activity, "sell-umbrella");
});

test("only people involved remember an action; apologies and help change trust and subsequent goals", () => {
  let world = f.createWorld();
  const startTrust = world.island.residents.xiaoman.relations.atuan;
  const gardenerMemories = structuredClone(world.island.residents.gardener.memories);
  world = act(world, "atuan", "admit-bread");
  assert.equal(world.island.residents.xiaoman.relations.atuan, startTrust + 12);
  assert.ok(world.island.residents.atuan.milestones.includes("confessed"));
  assert.ok(world.island.residents.xiaoman.knownFacts.some(fact => fact.includes("承认")));
  assert.ok(world.island.residents.xiaoman.memories.some(memory => memory.otherId === "atuan"));
  assert.deepEqual(world.island.residents.gardener.memories, gardenerMemories);
  assert.match(f.residentGoal(world.island, "atuan"), /重新相信/);
  assert.ok(!f.actionOptions(world).some(option => option.activity === "admit-bread"));
  for (let index = 0; index < 3; index++) world = act(world, "atuan", "help-neighbor");
  assert.match(f.residentGoal(world.island, "atuan"), /习惯/);
  assert.equal(world.island.residents.atuan.place, world.island.residents.xiaoman.place);
  const denied = act(f.createWorld(), "atuan", "deny-bread");
  assert.equal(denied.island.residents.xiaoman.relations.atuan, startTrust - 4);
  assert.ok(denied.island.residents.xiaoman.memories.some(memory => memory.otherId === "atuan" && memory.text.includes("否认")));
});

test("unavailable materials, duplicate harvests and unsupported model choices cannot mutate a day", () => {
  const world = f.createWorld(), snapshot = structuredClone(world);
  const craft = f.actionOptions(world).find(option => option.activity === "decorate-umbrella");
  const empty = structuredClone(world); empty.island.shop.looseFlowers = 0;
  assert.throws(() => f.makePlan(empty, [craft], [{ source: "story", status: "accepted", value: "不触发法则", reason: "无需法则效果。" }]), /做不了/);
  assert.deepEqual(world, snapshot);
  world.island.flowers.bridge = 4;
  const clears = f.actionOptions(world).filter(option => option.activity === "clear-flowers" && option.place === "bridge");
  assert.throws(() => f.validateActionBatch(world, clears.slice(0, 2)), /同一处花/);
  assert.equal(world.island.flowers.bridge, 4);
  assert.throws(() => f.selectCandidateActions(world, { actions: [{ candidateId: "invented" }, { candidateId: "invented" }, { candidateId: "invented" }] }), /尚不能执行/);
});

test("current saves preserve the initial story, resources and personal memories through round trips", async () => {
  const storage = memoryStorage(), repository = new f.WorldRepository(storage);
  const world = await repository.load();
  assert.equal(world.format, "pocket-civilization-v3");
  assert.equal(world.island.shop.sold, 0);
  for (const id of f.RESIDENT_IDS) {
    assert.deepEqual(world.island.residents[id].memories, world.events.filter(event => event.residentId === id).map(event => ({ eventId: event.id, day: event.day, text: event.text })));
  }
  const next = f.applyPlan(world, f.planStoryDay(world));
  await repository.save(next, world.revision);
  assert.deepEqual(await storage.getItem(f.WORLD_KEY), next);
  assert.deepEqual(await repository.load(), next);
});

test("invalid formats, inventory or personal memories are rejected rather than reset", () => {
  const world = f.createWorld();
  assert.throws(() => f.validateWorld({ ...world, format: "pocket-civilization-v1" }), /存档/);
  const badStock = structuredClone(world); badStock.island.shop.plainUmbrellas = -1;
  assert.throws(() => f.validateWorld(badStock), /资源/);
  const badMemory = structuredClone(world); badMemory.island.residents.atuan.memories.push({ eventId: "future", day: 8, text: "未来的事" });
  assert.throws(() => f.validateWorld(badMemory), /资源|日期/);
  const missingIsland = structuredClone(world); delete missingIsland.island;
  assert.throws(() => f.validateWorld(missingIsland), /存档/);
});

test("full flower beds never exceed capacity and the event text reports the actual growth", () => {
  let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("说真话的人，身边会开花。", 8));
  world.island.flowers.bridge = 29;
  world = act(world, "xiaoman", "bridge-fact");
  assert.equal(world.island.flowers.bridge, 30);
  assert.equal(world.events.at(-1).outcome.flowersGrown, 1);
  assert.match(world.events.at(-1).text, /一簇小花/);
  world = act(world, "xiaoman", "bridge-fact");
  assert.equal(world.island.flowers.bridge, 30);
  assert.equal(world.events.at(-1).outcome.flowersGrown, 0);
  assert.match(world.events.at(-1).text, /没有再添新花/);
});

test("long play across all supported laws keeps resources valid and important experiences after journal pruning", () => {
  for (const phrase of ["真话开花", "说谎下雨", "帮助开花", "夸奖下雨", "真话下雨", "说谎开花", "帮助下雨", "夸奖开花"]) {
    let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw(phrase, 8));
    for (let index = 0; index < 80; index++) world = f.applyPlan(world, f.planStoryDay(world));
    assert.equal(world.day, 87);
    assert.ok(world.events.length <= 180);
    f.validateWorld(world);
    for (const id of f.RESIDENT_IDS) {
      assert.ok(world.island.residents[id].memories.length <= 12);
      for (const score of Object.values(world.island.residents[id].relations)) assert.ok(score >= 0 && score <= 100);
    }
    if (phrase === "真话开花") assert.ok(world.island.residents.atuan.milestones.includes("confessed"));
  }
});

test("every pair of authored destinations has a finite route with correct endpoints", () => {
  for (const from of f.PLACE_IDS) for (const to of f.PLACE_IDS) {
    const route = f.walkingRoute(from, to);
    assert.deepEqual(route[0], f.PLACES[from]); assert.deepEqual(route.at(-1), f.PLACES[to]);
    assert.ok(route.length >= 2 && route.length < 15);
    assert.ok(route.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  }
});

test("a visit follows the recipient's earlier action that day rather than visiting an empty old location", () => {
  let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("说真话的人，身边会开花。", 8));
  world = f.applyPlan(world, f.planStoryDay(world));
  const options = f.actionOptions(world);
  const moving = options.find(option => option.activity === "bridge-fact");
  const visiting = options.find(option => option.residentId === "atuan" && option.activity === "help-neighbor");
  const actions = [moving, visiting], law = world.law;
  const plan = f.makePlan(world, actions, actions.map(action => f.storyJudgment(action, law, world)));
  assert.equal(plan.events[1].place, "bridge");
  const next = f.applyPlan(world, plan);
  assert.equal(next.island.residents.atuan.place, "bridge");
  assert.equal(next.island.residents.xiaoman.place, "bridge");
});

test("gathering flowers away from the shop includes the collection point and the return trip", () => {
  let world = f.createWorld(); world.island.flowers.bridge = 3;
  world = act(world, "gardener", "clear-flowers", "bridge");
  const event = world.events.at(-1);
  assert.equal(event.outcome.from, "orchard"); assert.equal(event.outcome.via, "bridge"); assert.equal(event.outcome.to, "shop");
  assert.equal(world.island.residents.gardener.place, "shop");
  assert.equal(world.island.flowers.bridge, 0); assert.equal(world.island.shop.looseFlowers, 5);
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

function intelligentFixture({ plugin = true, review = false, badCandidate = false, decide } = {}) {
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
      return { text: JSON.stringify({ type: "choice", value, confidence: review ? .2 : .99, reason: "根据提供的法则和明确事实判断。", ...(!material.法则原文 && decide ? await decide(material) : {}) }) };
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
        const material = JSON.parse(input.text.split("\n").at(-1));
        assert.ok(material.island.shop);
        assert.ok(material.residents.atuan.knownFacts.length);
        assert.ok(material.residents.atuan.currentGoal);
        const choices = [["atuan", "admit-bread"], ["xiaoman", "decorate-umbrella"], ["gardener", "help-neighbor"]];
        text = JSON.stringify({ actions: choices.map(([id, activity]) => ({ candidateId: badCandidate ? "invented-action" : material.candidates.find(candidate => candidate.residentId === id && candidate.activity === activity).id })) });
      }
      snapshot.messages.push({ id: crypto.randomUUID(), role: "assistant", status: "done", blocks: [{ type: "text", content: text }] });
      snapshot.phase = "idle"; snapshot.activeTaskId = null; publish();
      return { status: "dispatched" };
    },
    async stop() { return { ok: true }; },
  };
  const chat = { async listModels() { return [{ id: "local-test", provider: { name: "Local" }, modelName: "Fixture" }]; }, async createSession() { return session; }, async openSession() { return session; }, dispose() {} };
  const data = { storage, workspaces: { async list() { return [{ id: "pocket-workspace", isDefault: true }]; } } };
  return { intelligence: new f.IslandIntelligence(chat, data), calls, modelRequests, session, chat, data, storage };
}

test("application orchestration consumes actual decisions-plugin output through existing command format", async () => {
  const fixture = intelligentFixture();
  await fixture.intelligence.connect();
  const signal = new AbortController().signal;
  const law = await fixture.intelligence.interpretLaw("说真话的人，身边会开花。", 8, signal);
  let world = f.scheduleLaw({ ...f.createWorld(), mode: "intelligent" }, law);
  const plan = await fixture.intelligence.planDay(world, signal, () => {}, async (next) => (world = next));
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
  await assert.rejects(review.intelligence.planDay(world, new AbortController().signal, () => {}), /尚未改变/);
  assert.equal(world.day, 7);
});

test("unsupported model action choices stop before any plugin judgments or world changes", async () => {
  const fixture = intelligentFixture({ badCandidate: true });
  await fixture.intelligence.connect();
  const world = { ...f.createWorld(), mode: "intelligent" }, before = structuredClone(world);
  await assert.rejects(fixture.intelligence.planDay(world, new AbortController().signal, () => {}), /尚不能执行/);
  assert.equal(fixture.modelRequests.length, 0);
  assert.deepEqual(world, before);
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

test("flower stories reach all four endings through real conversations, petitions, work and trade", () => {
  for (const repeat of ["once", "always"]) for (const policy of ["harvest", "orchard"]) {
    let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("真话开花", 8));
    let choices = 0, practiced = false;
    for (let day = 0; day < 45; day++) {
      const petition = world.petitions.find((p) => p.lawId === world.law.id && !p.resolution);
      if (petition) {
        assert.ok(world.stories.flowers.at(-1).entries.some((entry) => entry.id === "discussion"));
        const snapshot = structuredClone(world.island);
        world = f.resolvePetition(world, petition.id, petition.kind === "repeat" ? repeat : policy);
        assert.deepEqual(world.island, snapshot, "choices take effect tomorrow without free resources");
        choices++;
      }
      const plan = f.planStoryDay(world);
      if (f.flowerPolicy(world) === "orchard") {
        assert.ok(f.actionOptions(world).filter((action) => action.activity === "bridge-fact").every((action) => action.place === "orchard"));
        if (plan.events.some((event) => event.activity === "bridge-fact" && event.place === "orchard")) practiced = true;
      }
      world = f.applyPlan(world, plan);
      const arc = world.stories.flowers.at(-1);
      if (arc.stage === "complete") {
        assert.equal(choices, 2);
        assert.equal(arc.repeatChoice, repeat); assert.equal(arc.policy, policy);
        assert.ok(arc.entries.some((entry) => entry.id === "practice"));
        assert.ok(arc.entries.some((entry) => entry.id === "customer"));
        assert.ok(world.island.shop.sold > arc.soldAtAgreement);
        assert.ok(f.roadFlowers(world.island) < 4);
        assert.match(arc.ending, policy === "harvest" ? /日常合作/ : /果园/);
        break;
      }
    }
    assert.equal(world.stories.flowers.at(-1).stage, "complete", `${repeat}/${policy} reaches its ending`);
    if (policy === "orchard") assert.ok(practiced);
    for (let i = 0; i < 15; i++) world = f.applyPlan(world, f.planStoryDay(world));
    assert.equal(world.petitions.length, 2, "completed stories never send the same petitions again");
    assert.equal(world.stories.friendship.stage, "friends");
    assert.equal(world.stories.friendship.entries.filter((entry) => entry.id === "friends").length, 1);
  }
});

test("stories need actual events, reject unrelated choices, and record a changed law without resetting the world", () => {
  let quiet = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("真话开花", 8));
  for (let i = 0; i < 8; i++) quiet = act(quiet, "gardener", "help-neighbor");
  assert.equal(quiet.petitions.length, 0, "dates alone never create the petition");
  let world = f.scheduleLaw(f.createWorld(), f.interpretStoryLaw("真话开花", 8));
  for (let i = 0; i < 2; i++) world = f.applyPlan(world, f.planStoryDay(world));
  assert.throws(() => f.resolvePetition(world, world.petitions[0].id, "orchard"), /提供的选择/);
  const prior = structuredClone(world);
  world = f.scheduleLaw(world, f.interpretStoryLaw("说谎下雨", world.day + 1));
  assert.deepEqual(world.island, prior.island);
  world = f.applyPlan(world, f.planStoryDay(world));
  assert.equal(world.stories.flowers[0].stage, "changed");
  assert.ok(world.stories.flowers[0].entries.some((entry) => entry.id === "law-change"));
  assert.equal(world.petitions.length, 1);
  assert.ok(world.events.some((event) => event.id === prior.events[0].id));
});

async function replayFixture(decide) {
  const fixture = intelligentFixture({ decide });
  const repository = new f.WorldRepository(fixture.storage);
  let world = await repository.load();
  world = await repository.save({ ...world, mode: "intelligent", modelId: "local-test", revision: world.revision + 1 }, world.revision);
  await fixture.intelligence.connect(world.modelId);
  return { ...fixture, repository, get world() { return world; }, async checkpoint(next) { world = await repository.save(next, world.revision); return world; } };
}

test("review, abstention, interpretation disputes and network errors preserve the completed prefix across reloads", async () => {
  for (const interruption of ["review", "abstain", "dispute", "network"]) {
    let blocked = true;
    const seen = [];
    const fixture = await replayFixture((material) => {
      seen.push(material);
      if (blocked && material.action.residentId === "xiaoman") {
        if (interruption === "network") throw new Error("local network interrupted");
        return { value: interruption === "abstain" ? null : interruption === "dispute" ? "存在解释争议" : "不触发法则", confidence: interruption === "review" ? .2 : .99, reason: "需要核对制作行为与法则之间的关系。" };
      }
      return {};
    });
    const original = structuredClone(fixture.world);
    await assert.rejects(fixture.intelligence.planDay(fixture.world, new AbortController().signal, () => {}, fixture.checkpoint), /尚未改变|network interrupted/);
    let saved = await fixture.repository.load();
    assert.equal(saved.day, original.day); assert.deepEqual(saved.island, original.island);
    assert.equal(saved.dayDraft.judgments.filter(f.isFinalJudgment).length, 1);
    assert.equal(saved.dayDraft.judgments[2], null);
    if (interruption === "network") assert.match(saved.dayDraft.failure, /network interrupted/);
    blocked = false;
    const reconnected = new f.IslandIntelligence(fixture.chat, fixture.data);
    await reconnected.connect(saved.modelId);
    const plan = await reconnected.planDay(saved, new AbortController().signal, () => {}, fixture.checkpoint, "请只依据已有的制作行为判断，不补充说话情节。");
    saved = await fixture.repository.save(f.applyPlan(fixture.world, plan), fixture.world.revision);
    assert.equal(saved.day, original.day + 1); assert.equal(saved.dayDraft, null);
    assert.equal(saved.island.shop.flowerUmbrellas, 1); assert.equal(saved.island.shop.plainUmbrellas, 5);
    assert.equal(fixture.calls.filter((text) => !text.startsWith("/")).length, 1, "the director is not rerun");
    assert.equal(seen.filter((material) => material.action.residentId === "atuan").length, 1, "accepted judgments are not reissued");
    assert.ok(seen.some((material) => material.review.playerNote.includes("已有的制作行为")));
    assert.throws(() => f.applyPlan(saved, plan), /旧的演绎/);
  }
});

test("cancellation and a failed checkpoint preserve prior judgments without settling resources", async () => {
  for (const interrupt of ["cancel", "disk"]) {
    const fixture = await replayFixture();
    const controller = new AbortController(), original = structuredClone(fixture.world.island);
    const checkpoint = async (next) => {
      if (interrupt === "disk" && next.dayDraft?.judgments[1]) fixture.storage.fail = true;
      const saved = await fixture.checkpoint(next);
      if (interrupt === "cancel" && saved.dayDraft?.judgments[0]) controller.abort();
      return saved;
    };
    await assert.rejects(fixture.intelligence.planDay(fixture.world, controller.signal, () => {}, checkpoint), /abort|disk full/i);
    fixture.storage.fail = false;
    const saved = await fixture.repository.load();
    assert.deepEqual(saved.island, original); assert.equal(saved.day, 7);
    assert.equal(saved.dayDraft.judgments.filter(f.isFinalJudgment).length, 1);
    const resumed = await fixture.intelligence.planDay(saved, new AbortController().signal, () => {}, fixture.checkpoint);
    assert.equal(f.applyPlan(fixture.world, resumed).day, 8);
  }
});

test("completed drafts retry only the final commit, while edits invalidate unfinished drafts", async () => {
  const fixture = await replayFixture();
  await fixture.intelligence.planDay(fixture.world, new AbortController().signal, () => {}, fixture.checkpoint);
  const calls = fixture.calls.length, saved = await fixture.repository.load();
  assert.ok(saved.dayDraft.judgments.every(f.isFinalJudgment));
  const plan = await fixture.intelligence.planDay(saved, new AbortController().signal, () => {}, fixture.checkpoint);
  assert.equal(fixture.calls.length, calls, "final save retry makes no model requests");
  assert.equal(f.applyPlan(fixture.world, plan).dayDraft, null);
  const changed = f.scheduleLaw(saved, f.interpretStoryLaw("真话开花", 8));
  assert.equal(changed.dayDraft, null); assert.equal(f.saveDayDraft(saved, null).dayDraft, null);
  assert.throws(() => f.validateWorld({ ...saved, modelId: "different-model" }), /草稿/);
  assert.throws(() => f.validateWorld({ ...saved, day: 8 }), /草稿/);
  const corrupted = structuredClone(saved); corrupted.dayDraft.judgments[0] = null;
  assert.throws(() => f.validateWorld(corrupted), /顺序/);
  const badStories = structuredClone(saved); badStories.stories.friendship.entries.push({ id: "future", day: 99, text: "还没发生" });
  assert.throws(() => f.validateWorld(badStories), /故事/);
});

test("a concurrent world edit cannot be overwritten by a pending draft checkpoint", async () => {
  const fixture = await replayFixture();
  const other = new f.WorldRepository(fixture.storage);
  let edited = false;
  await assert.rejects(fixture.intelligence.planDay(fixture.world, new AbortController().signal, () => {}, async (next) => {
    if (!edited) {
      edited = true;
      await other.save(f.scheduleLaw(fixture.world, f.interpretStoryLaw("真话开花", 8)), fixture.world.revision);
    }
    return fixture.checkpoint(next);
  }), /另一个页面/);
  const saved = await other.load();
  assert.equal(saved.pendingLaw.trigger, "truth"); assert.equal(saved.dayDraft, null); assert.equal(saved.day, 7);
});
