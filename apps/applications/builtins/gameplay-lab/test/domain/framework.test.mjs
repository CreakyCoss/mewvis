import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import { cardGame } from "../helpers/card-game.mjs";

test("a card framework supplies rule structure without copying sample content", () => {
  const model = f.createCardScoringModel("我的方案");
  assert.equal(model.format, "gameplay-card-v1");
  assert.deepEqual(model.cards, []);
  assert.deepEqual(model.decks[0].entries, []);
  assert.equal(model.fields.length, 1);
  assert.equal(model.actions.length, 1);
  assert.equal(model.goals.length, 1);
  assert.deepEqual(f.validateModel(model, true), []);
  const missing = f.validateModel(model);
  assert.ok(missing.length);
  assert.ok(
    !missing.some((issue) => ["状态", "行动", "目标"].includes(issue.path)),
  );
  const rule = f.scoringRules(model)[0];
  assert.equal(rule.effect.collection, model.decks[0].id);
  assert.equal(rule.effect.field, model.goals[0].field);
  assert.deepEqual(f.blankCardModel("原始类型").actions, []);
  const snapshot = structuredClone(model);
  assert.throws(() => f.addScoringStructure(model), /已有/);
  assert.deepEqual(model, snapshot);
});
test("registered frameworks bind a type, model format and fixed simulator", () => {
  assert.equal(f.frameworks.length, 4);
  for (const framework of f.frameworks) {
    assert.equal(
      f.defaultFramework(framework.gameType).gameType,
      framework.gameType,
    );
    assert.equal(
      f.createFrameworkModel(framework.id, "新方案").format,
      framework.schema,
    );
    assert.equal(f.frameworkForSimulator(framework.simulator), framework.id);
    assert.equal(f.frameworkDefinition(framework.id).schema, framework.schema);
  }
  assert.equal(
    f.frameworkForSimulator({ id: "card-combination", version: 1 }),
    null,
  );
});
test("the card table preview agrees with deterministic scoring and leaves the frozen run untouched", () => {
  const model = cardGame(),
    run = f.startRun(model, 42, 1),
    original = structuredClone(run),
    state = f.current(run);
  model.cards[0].value = 999;
  const selected = state.players[0].collections.deck.hand.map(
      (card) => card.id,
    ),
    preview = f.scoringPreview(run.model, state, "play", selected);
  assert.equal(preview.reason, "");
  const next = f.advanceSimulatedRun(run, { action: "play", cards: selected });
  assert.equal(
    f.current(next).players[0].values.score - state.players[0].values.score,
    preview.result.score,
  );
  assert.deepEqual(run, original);
  assert.ok(preview.result.score < 999);
});
test("the card table respects selection bounds, duplicate instances and action costs", () => {
  const model = cardGame();
  model.decks[0].minSelect = 2;
  model.fields.push({
    id: "chips",
    name: "筹码",
    description: "",
    initial: 0,
    role: "stock",
  });
  const run = f.startRun(model),
    state = f.current(run),
    ids = state.players[0].collections.deck.hand.map((card) => card.id);
  assert.match(f.scoringPreview(run.model, state, "play", []).reason, /请选择/);
  assert.match(
    f.scoringPreview(run.model, state, "play", [ids[0], ids[0]]).reason,
    /不同/,
  );
  const blocked = cardGame();
  blocked.actions[0].costs = [{ field: "score", value: 1 }];
  const blockedRun = f.startRun(blocked);
  assert.match(
    f.scoringPreview(blockedRun.model, f.current(blockedRun), "play", [])
      .reason,
    /不足/,
  );
});
