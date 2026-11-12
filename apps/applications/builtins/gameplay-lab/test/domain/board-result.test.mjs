import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import { boardGame } from "../helpers/board-game.mjs";

function finish(record, types) {
  for (const type of types)
    record = f.advanceBoardRecord(record, { type, player: record.final.actor });
  return record;
}

test("bankruptcy results use frozen rent, actual payment and the prior ownership snapshot", () => {
  const model = boardGame();
  let record = f.newBoardRecord("project", model, 3);
  record = finish(record, [
    "roll",
    "buy",
    "roll",
    "buy",
    "roll",
    "roll",
    "roll",
    "roll",
  ]);
  const before = structuredClone(record.final);
  record = finish(record, ["roll"]);
  assert.deepEqual(f.parseBoardRecord(record, "project"), record);
  const original = structuredClone(record);
  model.tiles[2].rent = 999;
  const result = f.boardResultSummary(record, record.final, before);
  assert.equal(result.kind, "won");
  assert.equal(result.winner, 1);
  assert.equal(result.bankruptcy.owed, 30);
  assert.equal(result.bankruptcy.paid, 15);
  assert.deepEqual(result.bankruptcy.transferred, [
    { id: "dock", name: "码头" },
  ]);
  assert.deepEqual(
    result.players.map((p) => p.cash),
    [0, 30],
  );
  assert.deepEqual(
    result.players[1].properties.map((p) => p.id),
    ["dock", "market"],
  );
  assert.deepEqual(result.players[0].properties, []);
  assert.deepEqual(result.unowned, []);
  result.players[1].properties[0].name = "changed";
  assert.deepEqual(record, original);
});

test("zero balance still shows an actual zero payment instead of the full rent or a missing value", () => {
  const model = boardGame();
  let record = f.newBoardRecord("project", model, 42);
  record.final.actor = 1;
  record.final.players[1].cash = 0;
  record.final.owners.dock = 0;
  const before = structuredClone(record.final);
  record = finish(record, ["roll"]);
  const result = f.boardResultSummary(record, record.final, before);
  assert.equal(result.bankruptcy.paid, 0);
  assert.equal(result.bankruptcy.owed, 30);
  assert.deepEqual(result.bankruptcy.transferred, []);
});

test("limits retain undecided results despite different cash and land totals", () => {
  const model = boardGame();
  model.rules.maxTurns = 1;
  let record = f.newBoardRecord("project", model, 42);
  record = finish(record, ["roll"]);
  const before = record.final;
  record = finish(record, ["buy"]);
  const result = f.boardResultSummary(record, record.final, before);
  assert.equal(result.kind, "limit");
  assert.equal(result.winner, null);
  assert.equal(result.bankruptcy, null);
  assert.deepEqual(
    result.players.map((p) => p.cash),
    [15, 20],
  );
  assert.deepEqual(
    result.players.map((p) => p.properties.length),
    [1, 0],
  );
  assert.deepEqual(result.unowned, [{ id: "market", name: "市场" }]);
  assert.equal(result.turns, 1);
  assert.equal(result.steps, 2);
  assert.equal(result.seed, 42);
});

test("earlier replay steps do not reveal future winners or terminal assets", () => {
  const record = finish(f.newBoardRecord("project", boardGame(), 42), [
    "roll",
    "buy",
    "roll",
  ]);
  assert.equal(f.boardResultSummary(record, f.boardReplay(record, 0)), null);
  assert.equal(f.boardResultSummary(record, f.boardReplay(record, 2)), null);
  const timeline = f.boardTimeline(record);
  assert.equal(
    f.boardResultSummary(record, timeline[3], timeline[2]).title,
    "玩家 1 获胜",
  );
});

test("missing prior ownership is not treated as a known count of transferred land", () => {
  const record = finish(f.newBoardRecord("project", boardGame(), 42), [
    "roll",
    "buy",
    "roll",
  ]);
  const result = f.boardResultSummary(record, record.final);
  assert.equal(result.bankruptcy.transferred, null);
  assert.equal(result.bankruptcy.paid, 20);
  assert.equal(result.modelName, record.model.name);
});
