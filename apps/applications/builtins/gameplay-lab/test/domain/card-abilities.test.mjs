import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

import { abilityGame } from "../helpers/card-abilities.mjs";

const state = (run) => f.current(run);
const moduleState = (run) => run["card-abilities"];
const view = (m, run, player = state(run).actor) =>
  f.cardScoringRuntime.observe(m, run, player);
const hand = (m, run, player = state(run).actor) =>
  state(run).players[player].collections[m.decks[0].id].hand;
const use = (m, run, id = "exchange", cards) => {
  const c = f.cardScoringRuntime
    .commands(m, view(m, run))
    .find(
      (c) =>
        c.type === "card-ability" &&
        c.skillId === id &&
        (!cards || c.cards.join() === cards.join()),
    );
  assert.ok(c, "expected a legal ability command");
  return f.advanceSimulatedRun(run, { action: "__module", command: c });
};
const end = (run) => f.advanceSimulatedRun(run, { action: "__end_turn" });
const identities = (m, run, player = 0) =>
  Object.values(state(run).players[player].collections[m.decks[0].id])
    .flat()
    .map((c) => c.id)
    .sort();

test("bounded draws preserve identities, seeded recycling, hidden order and capacity without mutating inputs", () => {
  const pile = {
      draw: [{ id: "d" }],
      hand: [{ id: "h" }],
      discard: [{ id: "x" }, { id: "y" }, { id: "z" }],
    },
    before = structuredClone(pile);
  const draw = f.drawCardItems(pile, 10, 4, true, 77);
  assert.equal(draw.cards.length, 3);
  assert.equal(draw.pile.hand.length, 4);
  assert.equal(draw.recycled, 3);
  assert.deepEqual(draw, f.drawCardItems(pile, 10, 4, true, 77));
  assert.deepEqual(pile, before);
  assert.equal(f.drawCardItems(pile, 3, 5, false, 77).cards.length, 1);
  assert.equal(f.drawCardItems(pile, 3, 1, true, 77).cards.length, 0);
  assert.deepEqual(
    Object.values(draw.pile)
      .flat()
      .map((c) => c.id)
      .sort(),
    Object.values(pile)
      .flat()
      .map((c) => c.id)
      .sort(),
  );
  assert.throws(() => f.drawCardItems(pile, 11, 5, true, 77));
});

test("ability drafts keep incomplete references editable and full execution rejects unsupported schemas and missing resources", () => {
  const m = abilityGame();
  assert.deepEqual(f.validateModel(m), []);
  for (const mutate of [
    (c) => (c.version = 2),
    (c) => (c.abilities[0].uses = 4),
    (c) => (c.abilities[0].discard = -1),
    (c) => (c.abilities[0].draw = 11),
    (c) => (c.abilities[0].extra = true),
    (c) => (c.abilities[0].cost.amount = 0),
    (c) => (c.abilities[1].focus.turns = 0),
    (c) => (c.abilities[1].id = c.abilities[0].id),
    (c) => (c.abilities[0].id = "__proto__"),
    (c) => (c.abilities[0].focus = { discount: 1, turns: 1, other: true }),
  ]) {
    const changed = structuredClone(m);
    mutate(changed.extensions["card-abilities"]);
    assert.ok(f.validateModel(changed, true).length);
  }
  const draft = structuredClone(m),
    ability = draft.extensions["card-abilities"].abilities[0];
  ability.deck = "missing";
  ability.cost.field = "missing";
  ability.name = "";
  assert.deepEqual(f.validateModel(draft, true), []);
  assert.ok(f.validateModel(draft).length);
  assert.throws(() => f.createSimulatedRun(f.cardSimulator, draft));
  assert.equal(f.resolveCardScoringComposition(draft, true).modules.length, 1);
  assert.ok(f.referencesTo(m, "energy").some((r) => r.includes("卡牌能力")));
  assert.throws(() => f.removeDefinition(m, "energy"), /引用/);
  assert.ok(
    f.referencesTo(m, m.decks[0].id).some((r) => r.includes("卡牌能力")),
  );
});

test("selected discards and draws pay once, keep the normal turn and do not expose drawn identities in public events", () => {
  const m = abilityGame(),
    run = f.createSimulatedRun(f.cardSimulator, m, 42, 2),
    before = structuredClone(run);
  const next = use(m, run),
    pile = state(next).players[0].collections[m.decks[0].id];
  assert.equal(pile.hand.length, 3);
  assert.equal(pile.discard.length, 1);
  assert.equal(pile.draw.length, 4);
  assert.equal(state(next).players[0].values.energy, 2);
  assert.equal(state(next).remaining, state(run).remaining);
  assert.equal(state(next).actor, 0);
  assert.equal(moduleState(next).used[0].exchange, 1);
  assert.deepEqual(identities(m, next), identities(m, run));
  assert.deepEqual(state(next).players[1], state(run).players[1]);
  assert.deepEqual(run, before);
  const notes = next.entries.at(-1).notes;
  assert.ok(notes.some((n) => n.includes("抽取 1 张牌")));
  assert.ok(
    notes.filter((n) => n.includes("抽取")).every((n) => !n.includes("副本")),
  );
  assert.deepEqual(
    view(m, next, 1).state.players[0].collections[m.decks[0].id].hand,
    [],
  );
  assert.deepEqual(
    view(m, next, 0).state.players[0].collections[m.decks[0].id].draw,
    [],
  );
});

test("foreign selections, wrong amounts, wrong owners, exhaustion and failures after payment are atomic", () => {
  const m = abilityGame(),
    run = f.createSimulatedRun(f.cardSimulator, m, 42, 2),
    before = structuredClone(run);
  const legal = f.cardScoringRuntime
    .commands(m, view(m, run))
    .find((c) => c.type === "card-ability" && c.skillId === "exchange");
  for (const mutate of [
    (c) => (c.player = 1),
    (c) => (c.target = 1),
    (c) => (c.skillId = "missing"),
    (c) => (c.cards = []),
    (c) => (c.cards = [hand(m, run, 1)[0].id]),
    (c) => (c.cards = [c.cards[0], c.cards[0]]),
    (c) => (c.extra = true),
  ]) {
    const bad = structuredClone(legal);
    mutate(bad);
    assert.throws(() =>
      f.advanceSimulatedRun(run, { action: "__module", command: bad }),
    );
    assert.deepEqual(run, before);
  }
  assert.throws(() =>
    f.executeCardAbility(
      m,
      run,
      moduleState(run),
      m.extensions["card-abilities"].abilities[0],
      { ...legal, cards: ["missing"] },
    ),
  );
  assert.deepEqual(run, before);
  let next = use(m, use(m, run));
  assert.equal(state(next).players[0].values.energy, 0);
  assert.ok(
    f
      .cardAbilityReason(
        m,
        view(m, next),
        m.extensions["card-abilities"].abilities[0],
      )
      .includes("不足"),
  );
  assert.throws(() =>
    f.advanceSimulatedRun(next, { action: "__module", command: legal }),
  );
  const once = structuredClone(m);
  once.extensions["card-abilities"].abilities[0].uses = 1;
  const used = use(once, f.createSimulatedRun(f.cardSimulator, once));
  assert.ok(
    f
      .cardAbilityReason(
        once,
        view(once, used),
        once.extensions["card-abilities"].abilities[0],
      )
      .includes("次数"),
  );
});

test("draw availability accounts for capacity, finite exhaustion and recycling selected discards", () => {
  const m = abilityGame();
  const a = m.extensions["card-abilities"].abilities[0];
  a.cost = null;
  a.draw = 10;
  a.discard = 0;
  let run = f.createSimulatedRun(f.cardSimulator, m);
  run = use(m, run);
  assert.equal(hand(m, run).length, 5);
  assert.match(f.cardAbilityReason(m, view(m, run), a), /容量/);
  Object.assign(m.decks[0], {
    handSize: 3,
    initialDraw: 3,
    entries: [{ card: "a", count: 3 }],
    recycle: "shuffle-discard",
  });
  a.discard = 1;
  a.draw = 2;
  run = f.createSimulatedRun(f.cardSimulator, m);
  const next = use(m, run);
  assert.equal(hand(m, next).length, 3);
  assert.equal(
    state(next).players[0].collections[m.decks[0].id].discard.length,
    0,
  );
  assert.deepEqual(identities(m, next), identities(m, run));
  m.decks[0].recycle = "stop";
  run = f.createSimulatedRun(f.cardSimulator, m);
  assert.match(f.cardAbilityReason(m, view(m, run), a), /抽牌区已空/);
});

test("focus discounts only ability fees, floors at zero and expires at the owner's stage end in solo and duo games", () => {
  const m = abilityGame();
  let run = f.createSimulatedRun(f.cardSimulator, m, 42, 2);
  run = use(m, run, "focus");
  assert.deepEqual(moduleState(run).focus[0], { discount: 1, turns: 2 });
  run = use(m, run);
  assert.equal(state(run).players[0].values.energy, 3);
  run = end(run);
  assert.equal(moduleState(run).focus[0].turns, 1);
  run = end(run);
  assert.equal(moduleState(run).focus[0].turns, 1);
  run = end(run);
  assert.equal(moduleState(run).focus[0], null);
  assert.ok(run.entries.at(-1).notes.some((n) => n.includes("专注已结束")));
  let solo = use(m, f.createSimulatedRun(f.cardSimulator, m), "focus");
  solo = end(solo);
  assert.equal(moduleState(solo).focus[0].turns, 1);
  solo = end(solo);
  assert.equal(moduleState(solo).focus[0], null);
  const free = structuredClone(m);
  free.fields.find((f) => f.id === "energy").initial = 0;
  free.extensions["card-abilities"].abilities[1].focus.discount = 3;
  const focused = use(
    free,
    f.createSimulatedRun(f.cardSimulator, free),
    "focus",
  );
  assert.equal(state(use(free, focused)).players[0].values.energy, 0);
});

test("the last ordinary action expires focus once and refreshing replaces rather than stacks", () => {
  const m = abilityGame();
  m.flow.actionsPerTurn = 1;
  const a = m.extensions["card-abilities"].abilities[0];
  a.focus = { discount: 2, turns: 3 };
  let run = use(m, f.createSimulatedRun(f.cardSimulator, m, 42, 2), "focus");
  run = use(m, run);
  assert.deepEqual(moduleState(run).focus[0], { discount: 2, turns: 3 });
  run = f.advanceSimulatedRun(run, {
    action: m.actions[0].id,
    cards: [hand(m, run)[0].id],
  });
  assert.equal(state(run).actor, 1);
  assert.equal(moduleState(run).focus[0].turns, 2);
});

test("per-step module snapshots replay charges, resource payment and focus expiry, and reject tampering", () => {
  const m = abilityGame();
  let t = f.newTrial("project", m, 42, 2);
  for (const id of ["focus", "exchange"]) {
    t.run = use(m, t.run, id);
    t.drivers.push("manual");
  }
  t.run = end(t.run);
  t.drivers.push("manual");
  const doc = f.trialDocument(t),
    restored = f.parseRecord(doc, "project");
  assert.deepEqual(restored, t);
  assert.equal(
    moduleState(f.cardScoringRunAtStep(restored.run, 0)).focus[0],
    null,
  );
  assert.equal(
    moduleState(f.cardScoringRunAtStep(restored.run, 1)).focus[0].turns,
    2,
  );
  assert.equal(
    moduleState(f.cardScoringRunAtStep(restored.run, 3)).focus[0].turns,
    1,
  );
  for (const mutate of [
    (d) => (d.log.choices[1].command.cards = ["other-player-card"]),
    (d) => (d.log.moduleStates["card-abilities"].focus[0].turns = 3),
    (d) => (d.log.final.players[0].values.energy = 4),
    (d) => (d.log.composition.modules[0].version = 9),
  ]) {
    const changed = structuredClone(doc);
    mutate(changed);
    assert.throws(() => f.parseRecord(changed, "project"));
  }
});

test("configured bots and experiments execute both authored rule sets through the same runtime", () => {
  for (const kind of ["exchange", "paid-draw"]) {
    const m = abilityGame();
    m.name = kind;
    m.flow.maxRounds = 3;
    if (kind === "paid-draw") {
      m.extensions["card-abilities"].abilities[0].discard = 0;
      m.extensions["card-abilities"].abilities[0].draw = 2;
    }
    const trial = f.newTrial("project", m, 42, 2);
    assert.equal(f.trialChoice(trial).choice.command.skillId, "focus");
    const sample = f.nextSample(f.newExperiment("project", m, 42, 2, "goal"));
    assert.equal(sample.error, undefined);
    assert.ok(sample.log.final.outcome);
    assert.ok(
      sample.log.choices.some((c) => c.command?.type === "card-ability"),
    );
    assert.deepEqual(
      f.runLog(f.restoreLog(m, sample.seed, 2, sample.log)),
      sample.log,
    );
  }
});

test("disabled abilities preserve content, old games and legacy scoring while unsupported skeletons reject ports", () => {
  const m = abilityGame(),
    run = f.createSimulatedRun(f.cardSimulator, m),
    config = structuredClone(m.extensions["card-abilities"]);
  f.setCardScoringModuleEnabled(m, "card-abilities", false);
  assert.deepEqual(m.extensions["card-abilities"], {
    ...config,
    enabled: false,
  });
  assert.equal(
    f.createSimulatedRun(f.cardSimulator, m)["card-abilities"],
    undefined,
  );
  assert.equal(moduleState(use(run.model, run)).used[0].exchange, 1);
  const unsupported = {
    ...f.cardScoringSkeleton,
    capabilities: f.cardScoringSkeleton.capabilities.filter(
      (c) => c !== "draw-piles",
    ),
  };
  assert.ok(
    f.resolveGameComposition(
      run.model.composition,
      run.model.extensions,
      unsupported,
      f.cardScoringLayout,
      f.cardScoringModules,
      false,
      run.model,
    ).issues.length,
  );
  f.setCardScoringModuleEnabled(m, "card-abilities", true);
  assert.deepEqual(m.extensions["card-abilities"], config);
});

test("ordered post-command settlement rolls back both module and core commands when a later hook fails", () => {
  const calls = [];
  const modules = ["first", "last"].map((id) => ({
    definition: {
      id,
      version: 1,
      name: id,
      timings: ["before-play", "after-command"],
    },
    stateKey: id,
    commandTypes: id === "first" ? ["change"] : [],
    createConfig: () => ({}),
    validate: () => [],
    initialize: () => ({ used: 0 }),
    observe: ({ value }) => value,
    commands: () => (id === "first" ? [{ type: "change", player: 0 }] : []),
    advance: ({ state, value }) => {
      state.value += 2;
      value.used++;
      return { state, value, events: [] };
    },
    afterAdvance: ({ state, value, events }) => {
      calls.push(id);
      state.value++;
      value.used++;
      if (id === "last") throw new Error("late failure");
      return { state, value, events };
    },
  }));
  const runtime = f.assembleGameRuntime({
    core: {
      validate: () => [],
      initialize: () => ({ value: 0 }),
      observe: (_m, s) => s,
      commands: () => [],
      choose: () => ({ type: "core", player: 0 }),
      advance: (_m, s) => {
        s.value++;
        return { state: s, events: [] };
      },
    },
    registry: modules,
    resolve: () => ({ issues: [], snapshot: {}, modules }),
    configs: () => ({ first: {}, last: {} }),
    commandPlayer: (c) => c.player,
    timings: () => ["before-play"],
    assertCommand: () => {},
    resetModules: () => false,
    completeModuleCommand: (s) => s,
  });
  const state = runtime.initialize({}, 42),
    before = structuredClone(state);
  for (const type of ["change", "core"]) {
    calls.length = 0;
    assert.throws(
      () => runtime.advance({}, state, { type, player: 0 }),
      /late failure/,
    );
    assert.deepEqual(state, before);
    assert.deepEqual(calls, ["first", "last"]);
  }
});
