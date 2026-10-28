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
      'export * from "./main/model.ts"; export * from "./main/engine.ts"; export * from "./main/fixtures.ts"; export * from "./main/storage.ts"; export * from "./main/definitions.ts"; export * from "./main/records.ts";export * from "./main/playtest.ts";export * from "./main/configured-policy.ts";export * from "./main/playtest-storage.ts";export * from "./main/comparison.ts";export * from "./main/comparison-project.ts";export * from "./main/simulators.ts";export * from "./main/catalog.ts";export * from "./main/compatibility.ts";export * from "./main/narrative.ts";export * from "./main/narrative-storage.ts";',
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
    exampleId: "development",
    simulator: { id: "resource-turns", version: 1 },
    brief: { coreLoop: "", question: "" },
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

test("scenarios override each player independently, inherit omitted defaults and freeze setup", () => {
  const model = f.makeTemplate(),
    config = f.defaultPlaytest("project-test"),
    scenario = config.scenarios[0];
  scenario.participants.push(f.initialPlayer(1));
  scenario.participants[0].name = "研究者";
  scenario.participants[0].values.materials = 60;
  scenario.participants[0].capabilities.laboratory = false;
  scenario.participants[1].values.research = 10;
  const setup = f.selectedSetup(config, model),
    trial = f.newTrial(config.projectId, model, 42, 2, setup),
    a = f.current(trial.run).players[0],
    b = f.current(trial.run).players[1];
  assert.equal(a.name, "研究者");
  assert.equal(a.values.materials, 60);
  assert.ok(!a.capabilities.includes("laboratory"));
  assert.equal(b.values.materials, 40);
  assert.equal(b.values.research, 10);
  assert.equal(model.fields[0].initial, 40);
  scenario.participants[0].values.materials = 0;
  setup.strategies[0].name = "changed";
  assert.equal(trial.setup.scenario.participants[0].values.materials, 60);
  assert.equal(f.trialDocument(trial).format, "gameplay-run-v2");
  assert.deepEqual(
    f.parseRecord(f.trialDocument(trial), trial.projectId),
    trial,
  );
  assert.deepEqual(f.replay(trial.run, []), trial.run);
});
test("configured action conditions and aggregate reserve costs apply to both primary and fallback decisions", () => {
  const model = f.makeTemplate(),
    strategy = {
      ...structuredClone(f.builtinStrategies[0]),
      id: "strategy-custom",
      name: "发展后研究",
      rules: [
        {
          action: "build",
          priority: 100,
          conditions: [{ field: "production", op: "lt", value: 4 }],
        },
        { action: "study", priority: 10, conditions: [] },
      ],
    };
  const run = f.startRun(model);
  assert.equal(f.chooseConfigured(run, strategy).action, "build");
  const after = f.step(run, f.chooseConfigured(run, strategy));
  assert.equal(f.chooseConfigured(after, strategy).action, "study");
  strategy.reserves = [{ field: "materials", value: 30 }];
  assert.equal(f.chooseConfigured(run, strategy).action, "study");
  const duplicate = f.makeTemplate();
  duplicate.actions.find((a) => a.id === "study").costs = [
    { field: "materials", value: 4 },
    { field: "materials", value: 4 },
  ];
  strategy.rules = [];
  strategy.reserves[0].value = 35;
  assert.equal(
    f.chooseConfigured(f.startRun(duplicate), strategy).action,
    "trade",
  );
  strategy.rules = model.actions.map((a) => ({
    action: a.id,
    priority: 0,
    conditions: [],
  }));
  assert.equal(f.chooseConfigured(run, strategy).action, "__end_turn");
  assert.equal(f.current(run).players[0].values.materials, 40);
});
test("weighted rules and random card selection are deterministic without mutating the run", () => {
  const model = f.makeTemplate(),
    strategy = {
      ...structuredClone(f.builtinStrategies[0]),
      id: "strategy-weighted",
      name: "混合",
      selection: "weighted",
      rules: [
        { action: "build", priority: 1, conditions: [] },
        { action: "study", priority: 3, conditions: [] },
      ],
    };
  const choices = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const run = f.startRun(model, seed),
      original = structuredClone(run);
    choices.add(f.chooseConfigured(run, strategy).action);
    assert.deepEqual(
      f.chooseConfigured(run, strategy),
      f.chooseConfigured(run, strategy),
    );
    assert.deepEqual(run, original);
  }
  assert.equal(choices.size, 2);
  const combo = f.startRun(f.makeTemplate("combination"), 51),
    cards = {
      ...strategy,
      cards: "random",
      rules: [{ action: "play", priority: 1, conditions: [] }],
    };
  const c = f.chooseConfigured(combo, cards);
  assert.equal(c.cards.length, 3);
  assert.equal(new Set(c.cards).size, 3);
  assert.deepEqual(c, f.chooseConfigured(combo, cards));
  assert.doesNotThrow(() => f.step(combo, c));
});
test("card policies distinguish group scoring from high base values", () => {
  const model = f.makeTemplate("combination");
  model.collections[0].handSize = 3;
  model.collections[0].maxSelect = 2;
  model.collections[0].cards = [
    { id: "a", name: "A", group: "pair", value: 1 },
    { id: "b", name: "B", group: "pair", value: 1 },
    { id: "c", name: "C", group: "solo", value: 20 },
  ];
  model.actions[0].effects[0].pairBonus = 100;
  const run = f.startRun(model),
    strategy = {
      ...structuredClone(f.builtinStrategies[0]),
      rules: [{ action: "play", priority: 1, conditions: [] }],
    };
  assert.deepEqual(f.chooseConfigured(run, strategy).cards.sort(), ["a", "b"]);
  strategy.cards = "value";
  assert.ok(f.chooseConfigured(run, strategy).cards.includes("c"));
});
test("configured experiments freeze participants and strategies, resume missing cells and report per-player goals", () => {
  const model = f.makeTemplate(),
    config = f.defaultPlaytest("project-test"),
    scenario = config.scenarios[0];
  scenario.seedCount = 2;
  scenario.participants.push(f.initialPlayer(1));
  scenario.participants[0].values.research = 90;
  scenario.participants[1].values.research = 90;
  const e = f.newConfiguredExperiment(
    config.projectId,
    model,
    f.selectedSetup(config, model, true),
  );
  scenario.participants[0].values.research = 0;
  e.samples.push(f.nextSample(e));
  const resumed = f.parseRecord(JSON.parse(JSON.stringify(e)), e.projectId);
  assert.equal(resumed.status, "interrupted");
  while (resumed.samples.length < 4)
    resumed.samples.push(f.nextSample(resumed));
  assert.equal(
    new Set(resumed.samples.map((s) => `${s.policy}:${s.seed}`)).size,
    4,
  );
  for (const row of f.experimentRows(resumed))
    for (const p of row.players) {
      assert.equal(p.reached, 2);
      assert.equal(p.goals[0].reached, 2);
    }
  assert.deepEqual(
    resumed.setup.arms.map((a) => a.strategyIds[1]),
    ["random", "random"],
  );
  const invalid = structuredClone(resumed);
  invalid.setup.scenario.participants[0].values.research = 0;
  assert.throws(() => f.parseRecord(invalid, e.projectId), /不一致/);
});
test("configuration parsers preserve editable orphans but execution rejects missing references and malformed data", () => {
  const model = f.makeTemplate(),
    config = f.defaultPlaytest("project-test"),
    custom = {
      ...structuredClone(f.builtinStrategies[0]),
      id: "strategy-test",
      name: "测试",
      rules: [{ action: "missing", priority: 1, conditions: [] }],
    };
  config.strategies.push(custom);
  config.scenarios[0].participants[0].strategyId = custom.id;
  assert.doesNotThrow(() => f.parsePlaytest(config, config.projectId));
  assert.throws(() => f.selectedSetup(config, model), /无效引用/);
  config.strategies[0].rules = [];
  config.scenarios[0].participants[0].values.missing = 1;
  assert.throws(() => f.selectedSetup(config, model), /初始状态/);
  config.scenarios[0].seedStart = 0xffffffff;
  assert.throws(
    () => f.parsePlaytest(config, config.projectId),
    /场景配置无效/,
  );
  const poisoned = f.defaultPlaytest("project-test");
  poisoned.scenarios[0].participants[0].values = JSON.parse('{"__proto__":1}');
  assert.throws(() => f.parsePlaytest(poisoned, poisoned.projectId));
  assert.throws(
    () => f.startRun(model, 42, 2, [f.initialPlayer()]),
    /初始配置/,
  );
});

function comparisonFixture() {
  const base = f.makeTemplate(),
    project = {
      id: "project-compare",
      model: structuredClone(base),
      versions: [
        {
          id: "version-base",
          name: "成本 8",
          model: base,
          createdAt: new Date().toISOString(),
        },
      ],
    },
    config = f.defaultPlaytest(project.id);
  config.scenarios[0].seedCount = 2;
  config.comparedStrategies = ["goal"];
  return { base, project, config };
}
function finishExperiment(e) {
  let sample;
  while ((sample = f.nextSample(e))) e.samples.push(sample);
  e.status = "completed";
  return e;
}
const studyCost = { kind: "cost", action: "study", index: 0 };
test("version comparisons freeze shared opening values and independently execute each rule snapshot", () => {
  const { base, project, config } = comparisonFixture();
  project.model.actions.find((a) => a.id === "study").costs[0].value = 16;
  project.model.fields.find((f) => f.id === "materials").initial = 900;
  const e = f.prepareComparison(project, config, {
    mode: "versions",
    baseline: "version-base",
    candidate: "draft",
  });
  assert.equal(e.format, "gameplay-experiment-v4");
  assert.equal(f.experimentTotal(e), 4);
  assert.equal(e.setup.scenario.participants[0].values.materials, 40);
  assert.equal(f.variantModel(e, "candidate").fields[0].initial, 900);
  project.model.actions[1].costs[0].value = 999;
  config.scenarios[0].participants[0].values.materials = 1;
  finishExperiment(e);
  for (const s of e.samples)
    assert.equal(
      f.restoreLog(
        f.sampleModel(e, s),
        s.seed,
        e.players,
        s.log,
        f.initialOf(e.setup.scenario),
      ).entries[0].state.players[0].values.materials,
      40,
    );
  assert.equal(f.variantModel(e, "candidate").actions[1].costs[0].value, 16);
  const difference = f.pairedDifference(e, "candidate", "goal");
  assert.equal(difference.count, 2);
  assert.ok(difference.steps > 0);
  assert.equal(difference.players[0].rate, 0);
  assert.equal(f.experimentRows(e).length, 2);
  assert.ok(
    f
      .ruleChanges(base, f.variantModel(e, "candidate"))
      .some((d) => d.label.includes("成本") && d.after.includes("16")),
  );
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(e)), e.projectId),
    e,
  );
});
test("parameter scans deduplicate the baseline and modify only the requested numeric rule", () => {
  const { project, config } = comparisonFixture(),
    original = structuredClone(project);
  const e = f.prepareComparison(project, config, {
    mode: "parameter",
    baseline: "draft",
    scan: { parameter: studyCost, from: 4, to: 12, step: 4 },
  });
  assert.deepEqual(
    e.comparison.variants.map((v) => v.value),
    [8, 4, 12],
  );
  assert.equal(f.experimentTotal(e), 6);
  assert.deepEqual(project, original);
  for (const v of e.comparison.variants)
    assert.deepEqual(
      f.variantModel(e, v.id),
      f.withParameter(original.model, studyCost, v.value),
    );
  e.samples.push(f.nextSample(e));
  assert.equal(f.pairedDifference(e, "value-4", "goal").count, 0);
  assert.equal(f.pairedDifference(e, "value-4", "goal").steps, null);
  let interrupted = f.parseRecord(JSON.parse(JSON.stringify(e)), e.projectId);
  assert.equal(interrupted.status, "interrupted");
  finishExperiment(interrupted);
  assert.equal(
    new Set(
      interrupted.samples.map((s) => `${s.variant}:${s.policy}:${s.index}`),
    ).size,
    6,
  );
  assert.ok(f.pairedDifference(interrupted, "value-4", "goal").steps < 0);
  assert.ok(f.pairedDifference(interrupted, "value-12", "goal").steps > 0);
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(interrupted)), e.projectId),
    interrupted,
  );
});
test("paired differences use only matching successful seeds and distinguish exceptions from truncation", () => {
  const { project, config } = comparisonFixture(),
    e = f.prepareComparison(project, config, {
      mode: "parameter",
      baseline: "draft",
      scan: { parameter: studyCost, from: 4, to: 4, step: 1 },
    });
  e.samples.push(f.nextSample(e));
  e.samples.push(f.nextSample(e)); // complete baseline seeds
  e.samples.push(f.nextSample(e));
  assert.equal(f.pairedDifference(e, "value-4", "goal").count, 1);
  const row = f.experimentRows(e).find((r) => r.variant === "value-4");
  assert.equal(row.completed, 1);
  const errorModel = f.makeTemplate();
  errorModel.actions[1].effects = [
    { type: "add", field: "research", value: 1, from: "materials" },
  ];
  project.model = errorModel;
  project.versions = [];
  const failing = f.prepareComparison(project, config, {
    mode: "parameter",
    baseline: "draft",
    scan: {
      parameter: {
        kind: "effect",
        action: "study",
        index: 0,
        property: "value",
      },
      from: 1000000,
      to: 1000000,
      step: 1,
    },
  });
  finishExperiment(failing);
  const delta = f.pairedDifference(failing, "value-1000000", "goal");
  assert.equal(delta.count, 0);
  assert.equal(delta.steps, null);
  const failed = f
    .experimentRows(failing)
    .find((r) => r.variant === "value-1000000");
  assert.equal(failed.error, 2);
  assert.equal(failed.completed, 0);
  assert.equal(failed.limited, 0);
  assert.doesNotThrow(() =>
    f.parseRecord(JSON.parse(JSON.stringify(failing)), failing.projectId),
  );
});
test("comparison plans reject invalid ranges, unsupported fields, incompatible openings and excess work", () => {
  const { project, config } = comparisonFixture(),
    scan = (parameter, from, to, step) =>
      f.prepareComparison(project, config, {
        mode: "parameter",
        baseline: "draft",
        scan: { parameter, from, to, step },
      });
  assert.throws(() => scan(studyCost, 1, 20, 1), /11/);
  assert.throws(() => scan(studyCost, 1, 2, 0), /范围|步长/);
  assert.throws(() => scan(studyCost, 8, 8, 1), /不同于基准/);
  assert.throws(() =>
    scan({ kind: "goal", goal: project.model.goals[0].id }, 0, 2, 1),
  );
  assert.throws(
    () =>
      scan(
        { kind: "effect", action: "study", index: 0, property: "__proto__" },
        1,
        2,
        1,
      ),
    /不存在/,
  );
  assert.throws(
    () =>
      f.prepareComparison(project, config, {
        mode: "versions",
        baseline: "draft",
        candidate: "draft",
      }),
    /不同/,
  );
  project.model.fields.push({
    id: "new-field",
    name: "新字段",
    description: "",
    role: "stock",
    initial: 0,
  });
  assert.throws(
    () =>
      f.prepareComparison(project, config, {
        mode: "versions",
        baseline: "version-base",
        candidate: "draft",
      }),
    /标识/,
  );
  project.model = structuredClone(project.versions[0].model);
  config.scenarios[0].seedCount = 12;
  config.strategies.push({
    ...structuredClone(f.builtinStrategies[0]),
    id: "strategy-four",
    name: "第四策略",
  });
  config.comparedStrategies = ["goal", "growth", "random", "strategy-four"];
  assert.throws(() => scan(studyCost, 1, 11, 1), /240/);
});
test("v3 readers reject altered sweep rules, duplicate sample cells and unknown variants", () => {
  const { project, config } = comparisonFixture(),
    e = finishExperiment(
      f.prepareComparison(project, config, {
        mode: "parameter",
        baseline: "draft",
        scan: { parameter: studyCost, from: 4, to: 4, step: 1 },
      }),
    );
  const extra = structuredClone(e);
  extra.comparison.variants[1].model.flow.maxRounds = 99;
  assert.throws(() => f.parseRecord(extra, e.projectId), /格式/);
  const duplicate = structuredClone(e);
  duplicate.samples[3] = duplicate.samples[2];
  assert.throws(() => f.parseRecord(duplicate, e.projectId));
  const unknown = structuredClone(e);
  unknown.samples[0].variant = "missing";
  assert.throws(() => f.parseRecord(unknown, e.projectId));
  const incomplete = structuredClone(e);
  incomplete.samples.pop();
  assert.throws(() => f.parseRecord(incomplete, e.projectId));
  assert.deepEqual(
    f.ruleChanges(project.model, structuredClone(project.model)),
    [],
  );
  const reordered = structuredClone(project.model);
  reordered.actions.reverse();
  assert.ok(
    f
      .ruleChanges(project.model, reordered)
      .some((c) => c.label.includes("行动顺序")),
  );
});

function userRules(kind = "resource-turns") {
  const model = f.blankModel("我自己的游戏");
  model.fields = [
    {
      id: "user-points",
      name: "灵感",
      description: "自己的指标",
      initial: 0,
      role: "progress",
    },
  ];
  model.actions = [
    {
      id: "user-create",
      name: "创作",
      description: "自己的行动",
      costs: [],
      requires: [],
      effects: [{ type: "add", field: "user-points", value: 3 }],
    },
  ];
  model.goals = [
    {
      id: "user-finish",
      name: "完成作品",
      description: "自己的目标",
      field: "user-points",
      threshold: 6,
    },
  ];
  if (kind === "card-combination") {
    model.collections = [
      {
        id: "user-deck",
        name: "灵感牌",
        handSize: 1,
        maxSelect: 1,
        cards: [
          { id: "user-red", name: "晨光", group: "暖", value: 2 },
          { id: "user-blue", name: "夜色", group: "冷", value: 4 },
        ],
      },
    ];
    model.actions[0].effects = [
      {
        type: "combination",
        collection: "user-deck",
        field: "user-points",
        multiplierValue: 1,
        pairBonus: 0,
      },
    ];
  }
  return model;
}
test("blank projects contain no example definitions and remain editable before readiness", () => {
  const model = f.blankModel("空白");
  for (const key of [
    "fields",
    "capabilities",
    "actions",
    "goals",
    "collections",
  ])
    assert.deepEqual(model[key], []);
  assert.deepEqual(f.validateModel(model, true), []);
  assert.equal(f.modelReadiness(model, null).length, 4);
  assert.equal(
    f.modelReadiness(model, { id: "resource-turns", version: 1 }).length,
    3,
  );
  assert.ok(
    f
      .modelReadiness(model, { id: "card-combination", version: 1 })
      .some((i) => i.path === "牌池"),
  );
  assert.ok(
    f
      .modelReadiness(model, { id: "future-sim", version: 99 })
      .some((i) => i.view === "simulator"),
  );
});
test("both simulators run hand-authored rules without any example IDs and freeze their versions", () => {
  for (const id of ["resource-turns", "card-combination"]) {
    const model = userRules(id),
      simulator = { id, version: 1 },
      config = f.defaultPlaytest("user-project"),
      setup = f.selectedSetup(config, model);
    assert.deepEqual(f.modelReadiness(model, simulator), []);
    const trial = f.newTrial("user-project", model, 42, 1, setup, simulator);
    while (!f.current(trial.run).outcome) {
      const cards =
        id === "card-combination"
          ? [
              f.current(trial.run).players[0].collections["user-deck"].hand[0]
                .id,
            ]
          : undefined;
      trial.run = f.advanceSimulatedRun(trial.run, {
        action: "user-create",
        ...(cards ? { cards } : {}),
      });
      trial.drivers.push("manual");
    }
    assert.equal(f.current(trial.run).outcome.kind, "won");
    assert.equal(trial.run.entries.length, 3);
    assert.equal(f.trialDocument(trial).format, "gameplay-run-v3");
    assert.deepEqual(
      f.parseRecord(
        JSON.parse(JSON.stringify(f.trialDocument(trial))),
        trial.projectId,
      ),
      trial,
    );
    assert.deepEqual(
      f.replay(
        trial.run,
        trial.run.entries.slice(1).map((e) => e.choice),
      ),
      trial.run,
    );
    const invalid = f.trialDocument(trial);
    invalid.simulator.version = 99;
    assert.throws(() => f.parseRecord(invalid, trial.projectId), /不支持/);
    assert.equal(model.fields[0].initial, 0);
  }
});
test("simulator readiness blocks unsupported rules instead of ignoring card mechanisms", () => {
  const model = userRules("card-combination");
  assert.throws(
    () => f.createSimulatedRun({ id: "resource-turns", version: 1 }, model),
    /集合|牌池|组合计分/,
  );
  assert.throws(
    () =>
      f.createSimulatedRun({ id: "card-combination", version: 1 }, userRules()),
    /牌池|计分/,
  );
  assert.throws(
    () =>
      f.createSimulatedRun({ id: "resource-turns", version: 99 }, userRules()),
    /不支持/,
  );
  model.actions[0].effects = [];
  assert.ok(
    f
      .modelReadiness(model, { id: "card-combination", version: 1 })
      .some((i) => i.nodeId === "user-create"),
  );
});
test("card scoring supports neutral fixed multipliers and scanning without a multiplier state", () => {
  const model = userRules("card-combination"),
    ref = { id: "card-combination", version: 1 };
  const run = f.createSimulatedRun(ref, model, 42);
  assert.equal(model.fields.length, 1);
  const selected = f.chooseConfigured(run, f.builtinStrategies[0]);
  const next = f.advanceSimulatedRun(run, selected),
    value = f.current(run).players[0].collections["user-deck"].hand[0].value;
  assert.equal(f.current(next).players[0].values["user-points"], value);
  const option = f
    .parameterOptions(model)
    .find((o) => o.ref.property === "multiplierValue");
  assert.ok(option);
  const twice = f.withParameter(model, option.ref, 2);
  assert.equal(twice.actions[0].effects[0].multiplierValue, 2);
  const ambiguous = structuredClone(twice);
  ambiguous.actions[0].effects[0].multiplier = "user-points";
  assert.ok(f.validateModel(ambiguous).length);
});
test("project source and selected simulator are independent and comparisons check runtime identity", () => {
  const project = {
    id: "user-project",
    gameType: "systems",
    direction: "resource-development",
    model: userRules(),
    simulator: { id: "resource-turns", version: 1 },
    exampleId: null,
    brief: { coreLoop: "创作循环", question: "需要几步？" },
    versions: [],
    workspaceId: "w",
    path: "/user/project",
    createdAt: new Date().toISOString(),
  };
  const doc = f.projectDocument(project);
  assert.equal(doc.project.format, "gameplay-project-v4");
  assert.equal(doc.project.exampleId, null);
  assert.equal(doc.project.templateId, undefined);
  assert.deepEqual(f.parseProjectDocument(doc, project), project);
  project.versions.push({
    id: "version-user",
    name: "v1",
    model: structuredClone(project.model),
    simulator: { id: "card-combination", version: 1 },
    createdAt: project.createdAt,
  });
  const config = f.defaultPlaytest(project.id);
  config.scenarios[0].seedCount = 1;
  assert.throws(
    () =>
      f.prepareComparison(project, config, {
        mode: "versions",
        baseline: "draft",
        candidate: "version-user",
      }),
    /相同的模拟器/,
  );
  const exp = f.newConfiguredExperiment(
    project.id,
    project.model,
    f.selectedSetup(config, project.model, true),
    project.simulator,
  );
  finishExperiment(exp);
  assert.equal(exp.format, "gameplay-experiment-v4");
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(exp)), project.id),
    exp,
  );
});

function storyFixture() {
  const m = f.blankNarrative("海港来信");
  m.characters = [{ id: "captain", name: "船长", description: "守候来信的人" }];
  m.variables = [
    { id: "letter", name: "拿到来信", type: "boolean", initial: false },
    { id: "trust", name: "信任", type: "number", initial: 1 },
    { id: "place", name: "目的地", type: "text", initial: "海港" },
  ];
  m.startNode = "dock";
  m.nodes = [
    {
      id: "dock",
      title: "海港",
      text: "船长看着你。",
      speaker: "captain",
      ending: false,
      choices: [
        {
          id: "search",
          label: "寻找来信",
          target: "dock",
          conditions: [],
          effects: [
            { variable: "letter", operation: "set", value: true },
            { variable: "trust", operation: "add", value: 2 },
            { variable: "place", operation: "set", value: "远海" },
          ],
        },
        {
          id: "depart",
          label: "带信出发",
          target: "end",
          conditions: [
            { variable: "letter", op: "eq", value: true },
            { variable: "trust", op: "gte", value: 3 },
          ],
          effects: [],
        },
      ],
    },
    {
      id: "end",
      title: "启航",
      text: "帆升起来了。",
      speaker: "",
      ending: true,
      choices: [],
    },
  ];
  return m;
}
test("type-specific blank narrative is independent from numeric turn schemas", () => {
  const m = f.blankNarrative("我的冒险");
  assert.deepEqual(f.validateNarrative(m, true), []);
  assert.ok(f.validateNarrative(m).length);
  assert.equal("fields" in m, false);
  assert.equal("flow" in m, false);
  assert.equal("goals" in m, false);
  const p = {
    id: "story-project",
    gameType: "narrative",
    direction: "branching-story",
    simulator: f.narrativeSimulator,
    brief: { coreLoop: "选择与后果", question: "结局是否可达" },
    exampleId: null,
    model: storyFixture(),
    versions: [],
    workspaceId: "w",
    path: "/story",
    createdAt: "now",
  };
  assert.deepEqual(f.projectReadiness(p), []);
  const document = f.projectDocument(p);
  assert.deepEqual(f.parseProjectDocument(document, p), p);
  document.project.gameType = "card";
  assert.throws(() => f.parseProjectDocument(document, p), /类型/);
  p.simulator = { id: "card-combination", version: 1 };
  assert.ok(f.projectReadiness(p).some((e) => e.path === "模拟器"));
});
test("branching narrative evaluates conditions and typed consequences atomically", () => {
  const m = storyFixture(),
    s = f.startStory(m);
  assert.deepEqual(
    f.availableChoices(m, s).map((c) => c.id),
    ["search"],
  );
  assert.throws(() => f.advanceStory(m, s, "depart"), /条件/);
  const next = f.advanceStory(m, s, "search");
  assert.equal(s.values.letter, false);
  assert.equal(next.values.trust, 3);
  assert.equal(next.values.place, "远海");
  assert.deepEqual(
    f.availableChoices(m, next).map((c) => c.id),
    ["search", "depart"],
  );
  assert.equal(f.advanceStory(m, next, "depart").outcome, "ending");
  const bad = storyFixture();
  bad.nodes[0].choices[0].effects.push({
    variable: "trust",
    operation: "add",
    value: 1_000_000,
  });
  const initial = f.startStory(bad);
  assert.throws(() => f.advanceStory(bad, initial, "search"), /越界/);
  assert.equal(initial.values.letter, false);
  assert.equal(initial.steps, 0);
});
test("story records freeze rules, reproduce every choice, and reject tampering or unsupported runtimes", () => {
  const m = storyFixture(),
    r = f.newStoryRecord("story-project", m),
    next = f.chooseStory(f.chooseStory(r, "search"), "depart");
  m.nodes[1].text = "草稿已修改";
  assert.equal(next.model.nodes[1].text, "帆升起来了。");
  assert.deepEqual(
    f.parseStoryRecord(JSON.parse(JSON.stringify(next)), "story-project"),
    next,
  );
  assert.equal(f.storyState(next, 1).node, "dock");
  assert.equal(f.storyState(next, 0).values.letter, false);
  const altered = structuredClone(next);
  altered.final.values.trust = 100;
  assert.throws(() => f.parseStoryRecord(altered, "story-project"), /重算/);
  altered.simulator.version = 2;
  assert.throws(() => f.parseStoryRecord(altered, "story-project"), /版本/);
  assert.throws(() => f.parseStoryRecord(next, "different-project"), /无效/);
});
test("narrative structural reachability is separate from conditional dead ends and run budgets", () => {
  const m = storyFixture();
  m.nodes[0].choices = m.nodes[0].choices.filter((c) => c.id === "depart");
  assert.equal(f.narrativeAnalysis(m).endings, 1);
  assert.equal(f.startStory(m).outcome, "blocked");
  const loop = storyFixture();
  let s = f.startStory(loop);
  for (let i = 0; i < 200; i++) s = f.advanceStory(loop, s, "search");
  assert.equal(s.outcome, "budget");
  assert.throws(() => f.advanceStory(loop, s, "search"), /结束/);
});
test("narrative validators reject malformed mechanisms, missing references, and cross-schema versions", () => {
  for (const mutate of [
    (m) => {
      m.nodes[0].choices[0].effects[0].operation = "execute";
    },
    (m) => {
      m.nodes[0].speaker = "missing";
    },
    (m) => {
      m.nodes[0].choices[1].conditions[0].value = "true";
    },
    (m) => {
      m.nodes[1].ending = false;
    },
    (m) => {
      m.nodes[0].choices[0].target = "missing";
    },
  ]) {
    const m = storyFixture();
    mutate(m);
    assert.ok(f.validateNarrative(m).length);
    assert.throws(() => f.startStory(m));
  }
  const m = storyFixture();
  m.nodes[0].choices[0].target = "";
  assert.deepEqual(f.validateNarrative(m, true), []);
  const p = {
    id: "story-project",
    gameType: "narrative",
    direction: "branching-story",
    simulator: f.narrativeSimulator,
    brief: { coreLoop: "", question: "" },
    exampleId: null,
    model: storyFixture(),
    versions: [
      { id: "v", name: "异构", createdAt: "now", model: f.makeTemplate() },
    ],
    workspaceId: "w",
    path: "/story",
    createdAt: "now",
  };
  assert.throws(() => f.projectDocument(p), /类型/);
});

test("orphan narrative drafts reject values that cannot survive JSON serialization", () => {
  for (const value of [NaN, Infinity, -Infinity, "x".repeat(1001)]) {
    const m = storyFixture();
    m.nodes[0].choices[0].effects = [
      { variable: "missing-variable", operation: "set", value },
    ];
    assert.ok(f.validateNarrative(m, true).length);
    m.nodes[0].choices[0].effects = [];
    m.nodes[0].choices[0].conditions = [
      { variable: "missing-variable", op: "eq", value },
    ];
    assert.ok(f.validateNarrative(m, true).length);
  }
});
