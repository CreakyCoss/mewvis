import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

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
  const pile = f.current(run).players[0].collections.hand;
  const originalIds = [...pile.hand, ...pile.draw, ...pile.discard]
    .map((c) => c.id)
    .sort();
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
    gameType: "systems",
    direction: "resource-development",
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
  model.cards = cards.map((c) => ({ ...c, description: "" }));
  Object.assign(model.decks[0], {
    handSize: 3,
    initialDraw: 3,
    maxSelect: 2,
    entries: cards.map((c) => ({ card: c.id, count: 1 })),
  });
  const effect = model.actions
    .find((a) => a.id === "play")
    .effects.find((e) => e.type === "combination");
  effect.pairBonus = 0;
  const low = f.choose(f.startRun(model), "goal");
  assert.ok(low.cards.some((id) => id.includes(":c:")));
  effect.pairBonus = 100;
  const run = f.startRun(model),
    high = f.choose(run, "goal");
  assert.deepEqual(high.cards.map((id) => id.split(":").at(-2)).sort(), [
    "a",
    "b",
  ]);
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
  model.decks[0].entries = [];
  model.decks[0].maxSelect = 8;
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
  e.setup.scenario.seedCount = 2;
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
  assert.equal(f.trialDocument(trial).format, "gameplay-run-v3");
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
  Object.assign(model.decks[0], {
    handSize: 3,
    initialDraw: 3,
    maxSelect: 2,
    entries: ["a", "b", "c"].map((card) => ({ card, count: 1 })),
  });
  model.cards = [
    { id: "a", name: "A", group: "pair", value: 1 },
    { id: "b", name: "B", group: "pair", value: 1 },
    { id: "c", name: "C", group: "solo", value: 20 },
  ].map((c) => ({ ...c, description: "" }));
  model.actions[0].effects[0].pairBonus = 100;
  const run = f.startRun(model),
    strategy = {
      ...structuredClone(f.builtinStrategies[0]),
      rules: [{ action: "play", priority: 1, conditions: [] }],
    };
  assert.deepEqual(
    f
      .chooseConfigured(run, strategy)
      .cards.map((id) => id.split(":").at(-2))
      .sort(),
    ["a", "b"],
  );
  strategy.cards = "value";
  assert.ok(
    f.chooseConfigured(run, strategy).cards.some((id) => id.includes(":c:")),
  );
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
