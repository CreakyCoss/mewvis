import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "gameplay-lab-test-"));
const entry = join(temporary, "model.mjs");
await build({
  stdin: {
    contents:
      'export * from "./main/model.ts"; export * from "./main/engine.ts"; export * from "./main/fixtures.ts"; export * from "./main/storage.ts"; export * from "./main/definitions.ts"; export * from "./main/records.ts";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: entry,
  logLevel: "silent",
});
const f = await import(pathToFileURL(entry).href);
after(() => rm(temporary, { recursive: true, force: true }));

test("both templates use one validator and engine and can reach their target", () => {
  for (const model of f.templates) {
    assert.deepEqual(f.validateModel(model), []);
    const run = f.simulate(model, 42, "goal");
    assert.equal(f.current(run).outcome.kind, "won");
    assert.ok(run.entries.length > 2);
  }
});
test("editing the draft cannot rewrite a running or historical snapshot", () => {
  const model = f.makeTemplate(),
    run = f.startRun(model);
  model.actions.find((a) => a.id === "study").costs[0].value = 100;
  const next = f.step(run, { action: "study" });
  assert.equal(f.current(next).players[0].values.materials, 32);
  assert.equal(f.current(run).players[0].values.materials, 40);
  assert.equal(run.model.actions[1].costs[0].value, 8);
});
test("aggregate costs and invalid selections are atomic", () => {
  const model = f.makeTemplate();
  model.actions[1].costs = [
    { field: "materials", value: 25 },
    { field: "materials", value: 25 },
  ];
  const run = f.startRun(model),
    original = structuredClone(run);
  assert.throws(() => f.step(run, { action: "study" }), /不足/);
  assert.deepEqual(run, original);
  const combo = f.startRun(f.makeTemplate("combination"));
  const id = f.current(combo).players[0].collections.hand.hand[0].id;
  assert.throws(
    () => f.step(combo, { action: "play", cards: [id, id] }),
    /不同对象/,
  );
  assert.throws(
    () => f.step(combo, { action: "play", cards: ["not-in-hand"] }),
    /不同对象/,
  );
  assert.equal(combo.entries.length, 1);
});
test("combination scoring explains arithmetic and preserves every collection member", () => {
  let run = f.startRun(f.makeTemplate("combination"), 17);
  const originalIds = run.model.collections[0].cards.map((c) => c.id).sort();
  for (let i = 0; i < 3 && !f.current(run).outcome; i++) {
    const choice = f.choose(run, "goal");
    run = f.step(run, choice);
    const pile = f.current(run).players[0].collections.hand;
    assert.deepEqual(
      [...pile.hand, ...pile.draw, ...pile.discard].map((c) => c.id).sort(),
      originalIds,
    );
    assert.match(run.entries.at(-1).notes.join(" "), /基础.*同类奖励.*倍率/);
  }
});
test("seed and recorded actions reproduce state, including replenishment", () => {
  const run = f.simulate(f.makeTemplate("combination"), 77, "growth", 2);
  const restored = f.replay(
    run,
    run.entries.slice(1).map((e) => e.choice),
  );
  assert.deepEqual(restored.entries, run.entries);
});
test("turns rotate, income resolves after all players, and goals check immediately", () => {
  let run = f.startRun(f.makeTemplate(), 42, 2);
  run = f.step(run, { action: "__end_turn" });
  assert.equal(f.current(run).actor, 1);
  assert.equal(f.current(run).round, 1);
  assert.equal(f.current(run).players[0].values.materials, 40);
  run = f.step(run, { action: "__end_turn" });
  assert.equal(f.current(run).round, 2);
  assert.equal(f.current(run).players[0].values.materials, 42);
  const model = f.makeTemplate();
  model.goals[0].threshold = 15;
  const won = f.step(f.startRun(model), { action: "study" });
  assert.equal(f.current(won).outcome.kind, "won");
  assert.equal(f.current(won).round, 1);
});
test("multiple objectives remain open and limits are not reported as draws or victories", () => {
  const model = f.makeTemplate();
  model.goals.push({
    id: "stock-target",
    name: "储备目标",
    description: "另一条达成路径",
    field: "materials",
    threshold: 50,
  });
  const run = f.step(f.startRun(model), { action: "trade" });
  assert.equal(f.current(run).outcome.winners[0].goal, "stock-target");
  const limited = f.makeTemplate();
  limited.flow.maxRounds = 1;
  assert.equal(
    f.current(f.step(f.startRun(limited), { action: "__end_turn" })).outcome
      .kind,
    "limit",
  );
});
test("overflow and malformed effects reject without committing", () => {
  const model = f.makeTemplate();
  model.fields[0].initial = 1_000_000;
  const run = f.startRun(model);
  assert.throws(() => f.step(run, { action: "trade" }), /数值范围/);
  assert.equal(f.current(run).players[0].values.materials, 1_000_000);
  const unknown = f.makeTemplate();
  unknown.actions[0].effects = [{ type: "executeCode", code: "unknown" }];
  assert.ok(f.validateModel(unknown).length);
  const missing = f.makeTemplate();
  missing.actions[1].costs[0].field = "missing";
  assert.throws(() => f.startRun(missing), /引用/);
});
test("unfinished project JSON persists structurally, while malformed data is rejected", () => {
  const project = {
    id: "test-project",
    workspaceId: "test-workspace",
    path: "/test/project",
    templateId: "development",
    createdAt: new Date().toISOString(),
    versions: [],
    model: f.makeTemplate(),
  };
  project.model.fields = [];
  project.model.capabilities = [];
  project.model.actions = [];
  project.model.goals = [];
  project.model.flow.income = [];
  const document = f.projectDocument(project);
  assert.doesNotThrow(() => f.parseProjectDocument(document, project));
  assert.throws(() => f.startRun(project.model), /至少/);
  document.project.versions = [
    { id: "v", name: "bad", createdAt: "now", model: {} },
  ];
  assert.throws(
    () => f.parseProjectDocument(document, project),
    /格式|无法读取/,
  );
  assert.deepEqual(f.initialWorkspace().projects, []);
});

test("pair bonus is a project rule used by scoring and the policy card selection", () => {
  const cards = [
    { id: "a", name: "A", group: "same", value: 1 },
    { id: "b", name: "B", group: "same", value: 1 },
    { id: "c", name: "C", group: "other", value: 20 },
  ];
  assert.equal(f.combinationScore(cards.slice(0, 2), 2, 7).score, 18);
  const model = f.makeTemplate("combination");
  model.collections[0].cards = cards;
  model.collections[0].handSize = 3;
  model.collections[0].maxSelect = 2;
  const effect = model.actions
    .find((a) => a.id === "play")
    .effects.find((e) => e.type === "combination");
  effect.pairBonus = 0;
  const low = f.choose(f.startRun(model), "goal");
  assert.ok(low.cards.includes("c"));
  effect.pairBonus = 100;
  const run = f.startRun(model),
    high = f.choose(run, "goal");
  assert.deepEqual(high.cards.slice().sort(), ["a", "b"]);
  assert.match(
    f.step(run, high).entries.at(-1).notes.join(" "),
    /同类奖励 100/,
  );
  effect.pairBonus = -1;
  assert.ok(f.validateModel(model).length);
});
test("definition deletion checks costs, sources, grants, goals and collection scoring; copies are isolated", () => {
  const model = f.makeTemplate();
  assert.ok(f.referencesTo(model, "production").includes("周期结算"));
  const original = structuredClone(model);
  assert.throws(() => f.removeDefinition(model, "production"), /周期结算/);
  assert.deepEqual(model, original);
  const id = f.duplicateDefinition(model, "study");
  model.actions.find((a) => a.id === id).costs[0].value = 999;
  assert.equal(model.actions.find((a) => a.id === "study").costs[0].value, 8);
  f.removeDefinition(model, id);
  assert.equal(model.actions.length, original.actions.length);
  const combo = f.makeTemplate("combination");
  assert.ok(f.referencesTo(combo, "hand").some((r) => r.includes("行动")));
  assert.throws(() => f.removeDefinition(combo, "hand"), /解除引用/);
  model.flow.income.push({ type: "grant", capability: "factory" });
  assert.ok(f.referencesTo(model, "factory").includes("周期结算"));
});
test("unfinished collection edits remain savable drafts but cannot run", () => {
  const model = f.makeTemplate("combination");
  model.collections[0].cards = [];
  model.collections[0].maxSelect = 8;
  assert.deepEqual(f.validateModel(model, true), []);
  assert.ok(f.validateModel(model).length);
  assert.throws(() => f.startRun(model));
});
test("compact records preserve events and exact deterministic state; tampering is rejected", () => {
  const trial = f.newTrial(
    "project-test",
    f.makeTemplate("combination"),
    55,
    2,
  );
  for (let i = 0; i < 4; i++) {
    trial.run = f.step(trial.run, f.choose(trial.run, "growth"));
    trial.drivers.push("growth");
  }
  const doc = f.trialDocument(trial);
  assert.equal(doc.log.events.length, 5);
  assert.equal(doc.log.events[0].state, undefined);
  const restored = f.parseRecord(
    JSON.parse(JSON.stringify(doc)),
    trial.projectId,
  );
  assert.deepEqual(restored, trial);
  doc.log.final.round = 999;
  assert.throws(() => f.parseRecord(doc, trial.projectId), /不一致/);
  doc.engine = 999;
  assert.throws(() => f.parseRecord(doc, trial.projectId), /引擎版本/);
});
test("interrupted experiments resume the missing cells exactly once and retain failures", () => {
  let e = f.newExperiment("project-test", f.makeTemplate(), 42, 2, "goal");
  e.count = 2;
  e.samples.push(f.nextSample(e));
  e = f.parseRecord(JSON.parse(JSON.stringify(e)), e.projectId);
  assert.equal(e.status, "interrupted");
  while (e.samples.length < 4) e.samples.push(f.nextSample(e));
  assert.equal(f.nextSample(e), null);
  assert.equal(new Set(e.samples.map((s) => `${s.policy}:${s.seed}`)).size, 4);
  e.status = "completed";
  assert.deepEqual(f.parseRecord(e, e.projectId), e);
  assert.equal(
    f.experimentRows(e).reduce((n, r) => n + r.completed, 0),
    4,
  );
  const invalid = structuredClone(e);
  invalid.samples[1] = invalid.samples[0];
  assert.throws(() => f.parseRecord(invalid, e.projectId));
  const broken = f.newExperiment(
    "project-test",
    f.makeTemplate(),
    1,
    1,
    "goal",
  );
  broken.model.actions[1].effects = [
    { type: "add", field: "research", value: 1000000, from: "materials" },
  ];
  broken.samples.push(f.nextSample(broken));
  assert.match(broken.samples[0].error, /数值范围/);
  assert.equal(f.experimentRows(broken)[0].error, 1);
  assert.doesNotThrow(() => f.parseRecord(broken, broken.projectId));
});
