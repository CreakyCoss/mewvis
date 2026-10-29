import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import { composedCards } from "./card-composition.test.mjs";

export function insightCards() {
  const model = composedCards();
  model.goals[0].threshold = 10000;
  f.setCardScoringModuleEnabled(model, "heroes", true);
  model.extensions.heroes.seats[0].skill.count = 3;
  return model;
}
const command = (target = 1, player = 0) => ({
  type: "skill",
  player,
  target,
  skillId: "insight",
});
const choice = (c = command()) => ({ action: "__module", command: c });

test("shared card operations select owned instances, move atomically, and isolate visible zones", () => {
  const hand = [
      { id: "a", value: 1 },
      { id: "b", value: 1 },
    ],
    discard = [{ id: "c" }];
  const before = structuredClone(hand);
  const moved = f.moveOwnedCards(hand, discard, ["b"]);
  assert.deepEqual(moved.source, [hand[0]]);
  assert.deepEqual(moved.destination, [...discard, hand[1]]);
  for (const ids of [["a", "a"], ["missing"], ["a", "missing"]])
    assert.throws(() => f.moveOwnedCards(hand, discard, ids));
  assert.throws(() => f.moveOwnedCards(hand, [hand[0]], ["a"]));
  assert.deepEqual(hand, before);
  assert.deepEqual(f.queryHandCards([{ hand }, { hand: discard }]), [
    ...hand,
    ...discard,
  ]);
  assert.deepEqual(f.visibleCardZone(hand, "owner", 1, 0), []);
  assert.deepEqual(f.visibleCardZone(hand, "hidden", 0, 0), []);
  const visible = f.visibleCardZone(hand, "owner", 0, 0);
  visible[0].value = 100;
  assert.deepEqual(hand, before);
});

test("active ability resolution gates timing, targets and charges and commits only successful effects", () => {
  const ability = { id: "insight", timing: "before-play", uses: 1 };
  const window = {
    player: 0,
    actor: 0,
    timing: "before-play",
    counts: [3, 2, 0],
  };
  assert.deepEqual(f.activeAbilityCommands(ability, 0, window), [command()]);
  assert.deepEqual(
    f.resolveActiveAbility(ability, 0, window, command(), () => "effect"),
    { used: 1, result: "effect" },
  );
  assert.throws(
    () =>
      f.resolveActiveAbility(ability, 0, window, command(), () => {
        throw new Error("effect failed");
      }),
    /effect failed/,
  );
  for (const [used, w, c] of [
    [1, window, command()],
    [-1, window, command()],
    [0, { ...window, timing: "after-play" }, command()],
    [0, { ...window, actor: 1 }, command()],
    [0, window, command(0)],
    [0, window, command(2)],
    [0, window, { ...command(), skillId: "bad" }],
  ]) {
    let called = false;
    assert.throws(() =>
      f.resolveActiveAbility(ability, used, w, c, () => {
        called = true;
      }),
    );
    assert.equal(called, false);
  }
});

test("the same capability-based heroes module resolves on both skeletons and rejects missing ports", () => {
  const card = insightCards(),
    ddz = f.createDoudizhuModel("共享洞察", "hero-doudizhu");
  const a = f.resolveCardScoringComposition(card),
    b = f.resolveDoudizhuComposition(ddz);
  assert.deepEqual(a.issues, []);
  assert.deepEqual(b.issues, []);
  assert.equal(
    a.modules.find((m) => m.definition.id === "heroes").definition,
    b.modules[0].definition,
  );
  assert.equal(
    a.modules.find((m) => m.definition.id === "heroes").definition.skeleton,
    undefined,
  );
  const unsupported = {
    ...f.cardScoringSkeleton,
    capabilities: f.cardScoringSkeleton.capabilities.filter(
      (c) => c !== "hand-zones",
    ),
  };
  assert.match(
    f
      .resolveGameComposition(
        card.composition,
        card.extensions,
        unsupported,
        f.cardScoringLayout,
        f.cardScoringModules,
      )
      .issues.map((i) => i.message)
      .join(),
    /缺少模块需要的能力/,
  );
  assert.equal(f.matchingCardScoringPreset(card), "custom");
});

test("two-player insight is deterministic and private, preserves turns, and rejects invalid commands atomically", () => {
  const model = insightCards(),
    run = f.createSimulatedRun(f.cardSimulator, model, 42, 2),
    original = structuredClone(run);
  for (const bad of [
    command(0),
    command(2),
    command(1, 1),
    { ...command(), skillId: "bad" },
    { ...command(), extra: 1 },
  ])
    assert.throws(() => f.advanceSimulatedRun(run, choice(bad)));
  assert.throws(() => f.advanceSimulatedRun(run, { ...choice(), cards: [] }));
  assert.throws(() =>
    f.advanceSimulatedRun(run, {
      action: model.actions[0].id,
      command: command(),
    }),
  );
  const next = f.advanceSimulatedRun(run, choice());
  assert.deepEqual(next, f.advanceSimulatedRun(run, choice()));
  assert.deepEqual(f.current(next), f.current(run));
  assert.equal(next.heroes.used[0], 1);
  assert.equal(next.entries.length, 2);
  assert.throws(() => f.advanceSimulatedRun(next, choice()));
  assert.deepEqual(run, original);
  const own = f.cardScoringRuntime.observe(model, next, 0),
    other = f.cardScoringRuntime.observe(model, next, 1);
  assert.equal(own.heroes.reveals[0].cards.length, 3);
  assert.equal(new Set(own.heroes.reveals[0].cards.map((c) => c.id)).size, 3);
  assert.deepEqual(other.heroes.reveals, []);
  assert.deepEqual(
    other.state.players[0].collections[model.decks[0].id].hand,
    [],
  );
  assert.ok(next.entries[1].notes.every((n) => !n.includes("副本")));
  const safe = f.prepareDecisionRun(next);
  assert.deepEqual(safe.heroes.reveals, own.heroes.reveals);
  assert.ok(safe.entries.every((e) => e.moduleStates === undefined));
  const rotated = f.advanceSimulatedRun(next, { action: "__end_turn" });
  assert.deepEqual(f.prepareDecisionRun(rotated).heroes.reveals, []);
  assert.ok(
    f.cardScoringRuntime.commands(model, own).some((c) => c.type === "action"),
  );
});

test("one-player and empty-target scenes offer no skill; disabling preserves content and old games", () => {
  const model = insightCards(),
    solo = f.createSimulatedRun(f.cardSimulator, model),
    duo = f.createSimulatedRun(f.cardSimulator, model, 42, 2);
  assert.ok(
    f.cardScoringRuntime
      .commands(model, f.cardScoringRuntime.observe(model, solo, 0))
      .every((c) => c.type !== "skill"),
  );
  assert.throws(() => f.advanceSimulatedRun(solo, choice()));
  const empty = structuredClone(duo);
  f.current(empty).players[1].collections[model.decks[0].id].hand = [];
  assert.throws(() => f.advanceSimulatedRun(empty, choice()));
  const config = structuredClone(model.extensions.heroes);
  f.setCardScoringModuleEnabled(model, "heroes", false);
  assert.deepEqual(model.extensions.heroes, { ...config, enabled: false });
  assert.throws(() =>
    f.advanceSimulatedRun(
      f.createSimulatedRun(f.cardSimulator, model, 42, 2),
      choice(),
    ),
  );
  assert.equal(f.advanceSimulatedRun(duo, choice()).heroes.used[0], 1);
  f.setCardScoringModuleEnabled(model, "heroes", true);
  assert.deepEqual(model.extensions.heroes, config);
});

test("skill commands freeze, replay and checkpoint without leaking future reveals", () => {
  const model = insightCards();
  let trial = f.newTrial("project", model, 42, 2);
  trial.run = f.advanceSimulatedRun(trial.run, choice());
  trial.drivers.push("manual");
  const doc = f.trialDocument(trial),
    restored = f.parseRecord(doc, "project");
  assert.deepEqual(restored, trial);
  const before = f.cardScoringRunAtStep(restored.run, 0),
    after = f.cardScoringRunAtStep(restored.run, 1);
  assert.deepEqual(
    f.cardScoringRuntime.observe(model, before, 0).heroes.reveals,
    [],
  );
  assert.equal(
    f.cardScoringRuntime.observe(model, after, 0).heroes.reveals.length,
    1,
  );
  for (const mutate of [
    (d) => (d.log.choices[0].command.target = 0),
    (d) => (d.log.moduleStates.heroes.used[0] = 0),
    (d) => (d.log.moduleStates.heroes.reveals[0][0].cards[0].value = 999),
    (d) =>
      (d.log.composition.modules.find((m) => m.id === "heroes").version = 2),
  ]) {
    const changed = structuredClone(doc);
    mutate(changed);
    assert.throws(() => f.parseRecord(changed, "project"));
  }
});

test("configured and default bots use shared abilities before scoring and produce terminating replayable experiments", () => {
  const model = insightCards(),
    run = f.createSimulatedRun(f.cardSimulator, model, 42, 2);
  assert.equal(
    f.chooseConfigured(run, f.builtinStrategies[0]).command.type,
    "skill",
  );
  assert.equal(
    f.trialChoice(f.newTrial("project", model, 42, 2)).choice.command.type,
    "skill",
  );
  const e = f.newExperiment("project", model, 42, 2, "goal"),
    sample = f.nextSample(e);
  assert.equal(sample.error, undefined);
  assert.ok(sample.log.final.outcome);
  assert.ok(sample.log.choices.filter((c) => c.command).length === 2);
  assert.deepEqual(
    f.runLog(f.restoreLog(model, sample.seed, 2, sample.log)),
    sample.log,
  );
});

test("module transport preserves authored action IDs and limits skill-only steps to the shared budget", () => {
  const model = insightCards();
  model.actions[0].id = "__module";
  const run = f.createSimulatedRun(f.cardSimulator, model, 42, 2);
  const card =
    f.current(run).players[0].collections[model.decks[0].id].hand[0].id;
  // A normal authored action remains an action even when its name equals the envelope label.
  assert.equal(
    f.advanceSimulatedRun(run, {
      action: "__module",
      cards: [
        card,
        f.current(run).players[0].collections[model.decks[0].id].hand[1].id,
      ],
    }).entries.length,
    2,
  );
  const budget = {
    ...run,
    entries: Array.from({ length: 200 }, () => run.entries[0]),
  };
  const last = f.advanceSimulatedRun(budget, choice());
  assert.equal(last.entries.length, 201);
  assert.equal(f.current(last).outcome.kind, "limit");
  assert.throws(() => f.advanceSimulatedRun(last, choice()));
  assert.equal(f.chooseSimulatedModule(last), undefined);
  const plain = f.startRun(f.exampleModel("development"));
  assert.throws(() => f.advanceSimulatedRun(plain, choice()), /模块命令/);
});
