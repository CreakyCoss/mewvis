import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import { cardGame } from "../helpers/card-game.mjs";
import { finishExperiment } from "../helpers/experiments.mjs";

const pile = (run) => f.current(run).players[0].collections.deck;
const ids = (value) =>
  [...value.draw, ...value.hand, ...value.discard]
    .map((card) => card.id)
    .sort();
const play = (run, count = 2) =>
  f.advanceSimulatedRun(run, {
    action: "play",
    cards: pile(run)
      .hand.slice(0, count)
      .map((card) => card.id),
  });

test("card drafts have their own schema and do not contain example cards or legacy collections", () => {
  const model = f.blankCardModel("空白卡牌");
  assert.equal(model.format, "gameplay-card-v1");
  for (const key of ["cards", "decks", "fields", "actions", "goals"])
    assert.deepEqual(model[key], []);
  assert.equal(model.collections, undefined);
  assert.deepEqual(f.validateModel(model, true), []);
  assert.ok(f.validateModel(model).length);
});
test("quantities create deterministic distinct instances for each participant without rewriting definitions", () => {
  const model = cardGame();
  model.decks[0].handSize = 3;
  const run = f.createSimulatedRun(f.cardSimulator, model, 42, 2);
  assert.equal(f.current(run).players[0].collections.deck.hand.length, 2);
  const all = f.current(run).players.flatMap((player) => {
    const p = player.collections.deck;
    assert.equal(ids(p).length, 6);
    assert.equal(
      [...p.hand, ...p.draw].filter((card) => card.definitionId === "sun")
        .length,
      3,
    );
    return ids(p);
  });
  assert.equal(new Set(all).size, 12);
  assert.deepEqual(f.createSimulatedRun(f.cardSimulator, model, 42, 2), run);
  model.cards[0].value = 99;
  model.decks[0].entries[0].count = 1;
  assert.equal(run.model.cards[0].value, 2);
  assert.equal(run.model.decks[0].entries[0].count, 3);
  assert.equal(run.model.cards[0].definitionId, undefined);
});
test("after-play refill consumes actual instances and a finite deck stops without creating cards", () => {
  const model = cardGame();
  model.decks[0].recycle = "stop";
  let run = f.startRun(model, 2);
  const original = ids(pile(run));
  for (let i = 0; i < 3; i++) {
    run = play(run);
    assert.deepEqual(ids(pile(run)), original);
    assert.equal(new Set(ids(pile(run))).size, 6);
  }
  assert.equal(pile(run).hand.length, 0);
  assert.equal(pile(run).discard.length, 6);
  assert.match(
    f.actionReason(run.model, f.current(run), run.model.actions[0]),
    /手牌不足/,
  );
  assert.deepEqual(f.choose(run, "goal"), { action: "__end_turn" });
  while (!f.current(run).outcome)
    run = f.advanceSimulatedRun(
      run,
      f.chooseConfigured(run, f.builtinStrategies[0]),
    );
  assert.equal(f.current(run).outcome.kind, "limit");
});
test("discard recycling preserves instance identity and emits reproducible zone movements", () => {
  const model = cardGame();
  model.decks[0].entries = [{ card: "sun", count: 2 }];
  let run = f.startRun(model, 9);
  const original = ids(pile(run));
  for (let i = 0; i < 4; i++) {
    run = play(run);
    assert.deepEqual(ids(pile(run)), original);
    assert.equal(pile(run).hand.length, 2);
    assert.equal(pile(run).discard.length, 0);
    assert.match(
      run.entries.at(-1).notes.join(" "),
      /弃牌洗回|弃牌区|洗回抽牌区/,
    );
  }
  assert.deepEqual(
    f.replay(
      run,
      run.entries.slice(1).map((entry) => entry.choice),
    ),
    run,
  );
});
test("turn-start refill respects player rotation and opening draws rather than topping up immediately", () => {
  const model = cardGame();
  model.decks[0].handSize = 3;
  model.decks[0].refill = "turn-start";
  let run = f.startRun(model, 8, 2);
  run = play(run, 1);
  assert.equal(f.current(run).players[0].collections.deck.hand.length, 1);
  assert.equal(f.current(run).players[1].collections.deck.hand.length, 2);
  run = f.step(run, { action: "__end_turn" });
  assert.equal(f.current(run).actor, 1);
  assert.equal(f.current(run).players[1].collections.deck.hand.length, 3);
  assert.equal(f.current(run).players[0].collections.deck.hand.length, 1);
  run = f.step(run, { action: "__end_turn" });
  assert.equal(f.current(run).round, 2);
  assert.equal(f.current(run).players[0].collections.deck.hand.length, 3);
});
test("no-refill and terminal turns never perform implicit extra draws", () => {
  const model = cardGame();
  model.decks[0].refill = "none";
  let run = play(f.startRun(model, 3), 1);
  run = f.step(run, { action: "__end_turn" });
  assert.equal(pile(run).hand.length, 1);
  assert.equal(pile(run).draw.length, 4);
  const ending = cardGame();
  ending.decks[0].refill = "turn-start";
  ending.flow.actionsPerTurn = 1;
  ending.goals[0].threshold = 1;
  const won = play(f.startRun(ending), 1);
  assert.equal(f.current(won).outcome.kind, "won");
  assert.equal(pile(won).hand.length, 1);
});
test("minimum selections, foreign instances and overflow reject atomically before paying or moving cards", () => {
  const model = cardGame();
  model.decks[0].minSelect = 2;
  model.fields.push({
    id: "coins",
    name: "金币",
    description: "",
    initial: 2,
    role: "stock",
  });
  model.actions[0].costs = [{ field: "coins", value: 1 }];
  const run = f.startRun(model),
    original = structuredClone(run),
    selected = pile(run).hand[0].id;
  for (const cards of [
    [selected],
    [selected, selected],
    [selected, "player-1:foreign"],
  ])
    assert.throws(() => f.step(run, { action: "play", cards }), /请选择/);
  assert.deepEqual(run, original);
  assert.equal(f.chooseConfigured(run, f.builtinStrategies[0]).cards.length, 2);
  const overflow = cardGame();
  overflow.fields[0].initial = 999_999;
  overflow.goals[0].threshold = 1_000_000;
  const before = f.startRun(overflow);
  assert.throws(() => play(before), /数值范围/);
  assert.equal(pile(before).discard.length, 0);
});
test("card validation preserves incomplete drafts and rejects malformed, duplicate and unsupported rules", () => {
  assert.deepEqual(f.validateModel(cardGame()), []);
  const changes = [
    (m) => {
      m.decks[0].initialDraw = 3;
    },
    (m) => {
      m.decks[0].minSelect = 3;
    },
    (m) => {
      m.decks[0].entries[0].count = 101;
    },
    (m) => {
      m.decks[0].entries.push({ card: "sun", count: 1 });
    },
    (m) => {
      m.cards[1].id = "sun";
    },
    (m) => {
      m.cards[0].id = "score";
    },
    (m) => {
      m.decks[0].refill = "unknown";
    },
    (m) => {
      m.cards[0].effects = [];
    },
    (m) => {
      m.decks[0].entries[0].card = "missing";
    },
    (m) => {
      m.actions[0].effects.push({ ...m.actions[0].effects[0] });
    },
    (m) => {
      m.actions[0].effects = null;
    },
    (m) => {
      m.flow = null;
    },
    (m) => {
      m.cards = [null];
    },
    (m) => {
      m.decks = [null];
    },
    (m) => {
      m.decks[0].entries = [null];
    },
    (m) => {
      m.cards[0].value = Infinity;
    },
    (m) => {
      m.decks[0].initialDraw = NaN;
    },
  ];
  for (const change of changes) {
    const model = cardGame();
    change(model);
    assert.ok(f.validateModel(model).length);
  }
  const orphan = cardGame();
  orphan.decks[0].entries[0].card = "missing";
  assert.deepEqual(f.validateModel(orphan, true), []);
  assert.throws(() => f.startRun(orphan), /不存在/);
  const empty = f.blankCardModel("尚未完成");
  empty.decks.push(f.newDeck());
  assert.deepEqual(f.validateModel(empty, true), []);
  const legacy = f.blankModel("经营模型");
  assert.throws(
    () => f.createSimulatedRun(f.cardSimulator, legacy),
    /独立卡牌模型/,
  );
  assert.throws(
    () =>
      f.createSimulatedRun({ id: "card-combination", version: 1 }, cardGame()),
    /不支持/,
  );
  assert.throws(
    () =>
      f.createSimulatedRun({ id: "resource-turns", version: 1 }, cardGame()),
    /不支持/,
  );
});
test("card runs freeze the v2 runtime and replay definitions, quantities, choices and instance IDs", () => {
  const model = cardGame();
  model.goals[0].threshold = 1;
  const trial = f.newTrial("card-project", model, 42, 1);
  trial.run = play(trial.run);
  trial.drivers.push("manual");
  const document = f.trialDocument(trial);
  assert.equal(document.format, "gameplay-run-v3");
  assert.deepEqual(document.simulator, f.cardSimulator);
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(document)), trial.projectId),
    trial,
  );
  const tampered = structuredClone(document);
  tampered.log.final.players[0].collections.deck.hand[0].id = "forged";
  assert.throws(() => f.parseRecord(tampered, trial.projectId), /不一致/);
  const noVersion = structuredClone(document);
  delete noVersion.simulator;
  assert.throws(() => f.parseRecord(noVersion, trial.projectId), /版本/);
  const unsupported = structuredClone(document);
  unsupported.simulator.version = 99;
  assert.throws(() => f.parseRecord(unsupported, trial.projectId), /不支持/);
});
test("each manual action takes selections from its own deck without consuming another deck's copies", () => {
  const model = cardGame();
  model.decks.push({
    ...structuredClone(model.decks[0]),
    id: "other",
    name: "另一牌库",
  });
  const run = f.startRun(model),
    state = f.current(run),
    first = state.players[0].collections.deck,
    other = state.players[0].collections.other;
  const selected = [...first.hand, ...other.hand].map((card) => card.id);
  const choice = f.selectionForAction(state, model.actions[0], selected);
  assert.deepEqual(
    choice,
    first.hand.map((card) => card.id),
  );
  const next = f.step(run, { action: "play", cards: choice });
  assert.deepEqual(f.selectionForAction(state, undefined, selected), []);
  assert.deepEqual(
    f.selectionForAction(
      state,
      {
        ...model.actions[0],
        effects: [{ type: "add", field: "score", value: 1 }],
      },
      selected,
    ),
    [],
  );
  assert.deepEqual(f.current(next).players[0].collections.other, other);
  assert.match(next.entries.at(-1).notes.join(" "), /副本/);
  assert.equal(
    next.entries.at(-1).notes.some((note) => note.includes("player-0:")),
    false,
  );
});
test("card quantities and attributes participate in frozen scans, comparisons and resumable experiments", () => {
  const model = cardGame(),
    config = f.defaultPlaytest("card-project");
  config.scenarios[0].seedCount = 1;
  const project = {
    id: config.projectId,
    model,
    versions: [],
    simulator: f.cardSimulator,
  };
  const count = f
    .parameterOptions(model)
    .find((option) => option.ref.kind === "deck-count");
  const experiment = f.prepareComparison(project, config, {
    mode: "parameter",
    baseline: "draft",
    scan: { parameter: count.ref, from: 2, to: 4, step: 1 },
  });
  finishExperiment(experiment);
  assert.equal(
    experiment.samples.some((sample) => sample.error),
    false,
  );
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(experiment)), project.id),
    experiment,
  );
  assert.equal(model.decks[0].entries[0].count, 3);
  const changed = f.withParameter(
    model,
    { kind: "card-value", card: "sun" },
    7,
  );
  assert.equal(changed.cards[0].value, 7);
  assert.equal(model.cards[0].value, 2);
  assert.ok(
    f
      .ruleChanges(model, changed)
      .some((change) => change.label.includes("卡牌属性")),
  );
  const basic = f.newExperiment(project.id, model, 42, 2, "goal");
  assert.deepEqual(basic.simulator, f.cardSimulator);
  basic.status = "cancelled";
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(basic)), project.id),
    basic,
  );
});
test("built-in card JSON directly uses the current model and obsolete runtimes are unavailable", () => {
  const example = f.exampleModel("combination");
  assert.equal(example.format, "gameplay-card-v1");
  assert.deepEqual(f.validateModel(example), []);
  assert.equal(f.current(f.simulate(example, 42, "goal")).outcome.kind, "won");
  assert.deepEqual(
    f.projectReadiness({
      gameType: "card",
      direction: "card-scoring",
      simulator: f.cardSimulator,
      model: example,
    }),
    [],
  );
  assert.equal(
    f.simulatorDefinition({ id: "card-combination", version: 1 }),
    undefined,
  );
});
