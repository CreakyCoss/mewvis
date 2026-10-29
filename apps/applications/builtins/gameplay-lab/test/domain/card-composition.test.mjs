import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

export function composedCards(preset = "paired-scoring") {
  const m = f.createFrameworkModel("card-scoring", "组合试验", preset);
  m.cards = [
    { id: "red", name: "红牌", description: "", group: "red", value: 1 },
    { id: "blue", name: "蓝牌", description: "", group: "blue", value: 9 },
  ];
  Object.assign(m.decks[0], {
    entries: [
      { card: "red", count: 2 },
      { card: "blue", count: 1 },
    ],
    handSize: 3,
    initialDraw: 3,
    minSelect: 2,
    maxSelect: 2,
  });
  m.actions[0].effects[0].pairBonus = 20;
  m.goals[0].threshold = 20;
  return m;
}

test("framework registrations supply compatible presets and blank content through a common creation contract", () => {
  for (const id of ["card-scoring", "doudizhu"]) {
    const creation = f.frameworkCreation(id);
    assert.equal(creation.presets.length, 2);
    for (const preset of creation.presets) {
      const model = f.createFrameworkModel(id, "预设", preset.id);
      assert.deepEqual(f.validateDesign(model, true), []);
      assert.equal(model.composition.skeleton.id, id);
      assert.ok(model.composition.layout.version);
      if (id === "card-scoring") assert.deepEqual(model.cards, []);
    }
  }
  assert.throws(
    () => f.createFrameworkModel("card-scoring", "错误", "hero-doudizhu"),
    /不兼容/,
  );
  assert.throws(
    () => f.createFrameworkModel("doudizhu", "错误", "paired-scoring"),
    /不兼容/,
  );
});

test("paired preset and manually assembled rules produce the same states and leave source designs immutable", () => {
  const preset = composedCards(),
    custom = structuredClone(preset);
  f.setCardScoringModuleEnabled(custom, "pair-reward", false);
  f.setCardScoringModuleEnabled(custom, "pair-reward", true);
  const before = structuredClone(custom);
  let a = f.createSimulatedRun(f.cardSimulator, preset, 77),
    b = f.createSimulatedRun(f.cardSimulator, custom, 77);
  assert.deepEqual(a, b);
  for (let step = 0; !f.current(a).outcome && step < 20; step++) {
    const choice = f.chooseConfigured(a, f.builtinStrategies[0]);
    a = f.advanceSimulatedRun(a, choice);
    b = f.advanceSimulatedRun(b, choice);
    assert.deepEqual(a, b);
  }
  assert.equal(f.current(a).outcome.kind, "won");
  assert.deepEqual(custom, before);
  assert.equal(custom.actions[0].effects[0].pairBonus, 20);
});

test("disabling pair rewards changes policy, preview and settlement together without erasing configured bonuses", () => {
  const on = composedCards(),
    off = structuredClone(on);
  f.setCardScoringModuleEnabled(off, "pair-reward", false);
  const a = f.createSimulatedRun(f.cardSimulator, on),
    b = f.createSimulatedRun(f.cardSimulator, off);
  const hand = f.current(a).players[0].collections[on.decks[0].id].hand;
  const reds = hand.filter((c) => c.group === "red").map((c) => c.id),
    action = on.actions[0].id;
  assert.equal(
    f.scoringPreview(on, f.current(a), action, reds).result.score,
    22,
  );
  assert.equal(
    f.scoringPreview(off, f.current(b), action, reds).result.score,
    2,
  );
  const ac = f.chooseConfigured(a, f.builtinStrategies[0]),
    bc = f.chooseConfigured(b, f.builtinStrategies[0]);
  assert.deepEqual(new Set(ac.cards), new Set(reds));
  assert.notDeepEqual(new Set(bc.cards), new Set(reds));
  const an = f.advanceSimulatedRun(a, { action, cards: reds }),
    bn = f.advanceSimulatedRun(b, { action, cards: reds });
  const field = on.goals[0].field;
  assert.equal(f.current(an).players[0].values[field], 22);
  assert.equal(f.current(bn).players[0].values[field], 2);
  assert.equal(f.current(an).outcome.kind, "won");
  assert.equal(f.current(bn).outcome, null);
  assert.equal(bn.model.actions[0].effects[0].pairBonus, 20);
  f.setCardScoringModuleEnabled(off, "pair-reward", true);
  assert.equal(off.actions[0].effects[0].pairBonus, 20);
});

test("card player views hide draw order and other hands, while legal action candidates execute atomically", () => {
  const model = composedCards(),
    run = f.createSimulatedRun(f.cardSimulator, model, 11, 2),
    before = structuredClone(run);
  const view = f.cardScoringRuntime.observe(model, run, 0),
    deck = model.decks[0].id;
  assert.equal(view.state.players[0].collections[deck].hand.length, 3);
  assert.deepEqual(view.state.players[0].collections[deck].draw, []);
  assert.deepEqual(view.state.players[1].collections[deck].hand, []);
  assert.equal(view.counts[1][deck].hand, 3);
  const policy = f.prepareDecisionRun(run);
  assert.deepEqual(f.current(policy).players[1].collections[deck].hand, []);
  for (const command of f.cardScoringRuntime.commands(model, view))
    assert.doesNotThrow(() =>
      f.cardScoringRuntime.advance(model, run, command),
    );
  assert.throws(
    () =>
      f.cardScoringRuntime.advance(model, run, {
        type: "action",
        player: 1,
        choice: { action: "__end_turn" },
      }),
    /当前/,
  );
  assert.deepEqual(run, before);
});

test("card trial and experiment logs freeze assembly and module state; modified or missing snapshots are rejected", () => {
  const m = composedCards();
  let trial = f.newTrial("p", m, 42, 1);
  trial.run = f.advanceSimulatedRun(trial.run, f.trialChoice(trial).choice);
  trial.drivers.push("goal");
  const doc = f.trialDocument(trial);
  assert.equal(doc.log.composition.skeleton.id, "card-scoring");
  assert.deepEqual(doc.log.moduleStates, { "pair-reward": null });
  assert.deepEqual(f.parseRecord(doc, "p"), trial);
  for (const change of [
    (r) => (r.log.composition.layout.version = 9),
    (r) => (r.log.moduleStates["pair-reward"] = { tampered: true }),
    (r) => delete r.log.composition,
  ]) {
    const bad = structuredClone(doc);
    change(bad);
    assert.throws(() => f.parseRecord(bad, "p"));
  }
  f.setCardScoringModuleEnabled(m, "pair-reward", false);
  assert.deepEqual(f.parseRecord(doc, "p"), trial);
  const config = f.defaultPlaytest("p");
  config.scenarios[0].seedCount = 1;
  const experiment = f.newConfiguredExperiment(
    "p",
    trial.run.model,
    f.selectedSetup(config, trial.run.model, true),
    f.cardSimulator,
  );
  const sample = f.nextSample(experiment);
  assert.equal(sample.error, undefined);
  assert.equal(sample.log.composition.modules[0].id, "pair-reward");
  assert.deepEqual(
    f.runLog(
      f.restoreLog(
        experiment.model,
        sample.seed,
        experiment.players,
        sample.log,
        f.initialOf(experiment.setup.scenario),
        experiment.simulator,
      ),
    ),
    sample.log,
  );
});

test("old card snapshots keep their original scoring and serialized form; incompatible combinations cannot run", () => {
  const legacy = composedCards();
  delete legacy.composition;
  delete legacy.extensions;
  const before = JSON.stringify(legacy),
    trial = f.newTrial("p", legacy, 5, 1),
    doc = f.trialDocument(trial);
  assert.equal(doc.log.composition, undefined);
  assert.deepEqual(f.parseRecord(doc, "p"), trial);
  assert.equal(JSON.stringify(legacy), before);
  for (const change of [
    (m) => (m.composition.layout.id = "three-player-table"),
    (m) => (m.composition.modules[0].id = "heroes"),
    (m) => (m.composition.modules[0].version = 2),
    (m) => (m.extensions["pair-reward"].enabled = false),
  ]) {
    const bad = composedCards();
    change(bad);
    assert.ok(f.validateModel(bad).length);
    assert.throws(() => f.createSimulatedRun(f.cardSimulator, bad));
  }
});
