import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import { boardGame } from "../helpers/board-game.mjs";

function plan(model, before, type = "roll") {
  const command = { type, player: before.actor };
  const after = f.advanceBoard(model, before, command).state;
  return {
    after,
    frames: f.boardPresentationFrames(model, before, after, command),
  };
}

test("movement follows the saved die through repeated laps and receives income before rent", () => {
  const model = boardGame();
  model.rules.diceSides = 6;
  model.rules.salary = 7;
  model.tiles[1].rent = 10;
  const before = f.startBoard(model, 1600);
  before.players[0].position = 3;
  before.players[0].cash = 5;
  before.owners.dock = 1;
  const original = structuredClone({ model, before });
  const { after, frames } = plan(model, before);
  const moving = frames.filter((frame) => frame.phase === "move");
  assert.deepEqual(
    moving.map((frame) => frame.state.players[0].position),
    [0, 1, 2, 3, 0, 1],
  );
  assert.deepEqual(
    moving.map((frame) => frame.state.players[0].cash),
    [12, 12, 12, 12, 19, 19],
  );
  assert.equal(frames[0].state.players[0].position, 3);
  assert.equal(frames[0].die, after.lastMove.die);
  assert.deepEqual(frames[0].cashChanges, []);
  assert.deepEqual(frames.at(-1).state.players, after.players);
  assert.deepEqual(frames.at(-1).cashChanges, [
    { player: 0, amount: 14, label: "起点收入" },
    { player: 0, amount: -10, label: "支付租金" },
    { player: 1, amount: 10, label: "收到租金" },
  ]);
  assert.ok(
    frames.every(
      (frame) =>
        frame.state.actor === before.actor && frame.state.turn === before.turn,
    ),
  );
  assert.deepEqual({ model, before }, original);
  frames.at(-1).state.players[0].cash = 0;
  assert.equal(after.players[0].cash, 9);
});

test("buying shows its actual cost and ownership without replaying movement or salary", () => {
  const model = boardGame();
  const landed = f.advanceBoard(model, f.startBoard(model), {
    type: "roll",
    player: 0,
  }).state;
  const { after, frames } = plan(model, landed, "buy");
  assert.equal(frames.length, 1);
  assert.equal(frames[0].phase, "settle");
  assert.equal(frames[0].die, null);
  assert.equal(frames[0].state.owners.dock, 0);
  assert.equal(frames[0].state.players[0].cash, 15);
  assert.deepEqual(frames[0].cashChanges, [
    { player: 0, amount: -5, label: "购买地产" },
  ]);
  assert.equal(after.actor, 1);
  assert.deepEqual(plan(model, landed, "skip").frames, []);
});

test("bankruptcy receipts show the actual balance paid and transfer assets with settlement", () => {
  const model = boardGame();
  const before = f.startBoard(model);
  before.actor = 1;
  before.players[1].cash = 10;
  before.owners.dock = 0;
  before.owners.market = 1;
  const { after, frames } = plan(model, before);
  assert.equal(after.outcome.kind, "won");
  const moving = frames.find((frame) => frame.phase === "move");
  assert.equal(moving.state.players[1].cash, 10);
  assert.equal(moving.state.owners.market, 1);
  const settled = frames.at(-1);
  assert.deepEqual(settled.state.players, after.players);
  assert.deepEqual(settled.state.owners, after.owners);
  assert.deepEqual(settled.cashChanges, [
    { player: 1, amount: -10, label: "支付租金" },
    { player: 0, amount: 10, label: "收到租金" },
  ]);
  assert.equal(settled.state.outcome, null);
});

test("equal income and rent remain separate receipts even when the payer's net change is zero", () => {
  const model = boardGame();
  model.rules.salary = 10;
  model.tiles[1].rent = 10;
  const before = f.startBoard(model, 800);
  // Select a deterministic one-step crossing by starting at the previous space.
  const probe = f.advanceBoard(model, before, {
    type: "roll",
    player: 0,
  }).state;
  before.players[0].position =
    (model.tiles.length + 1 - probe.lastMove.die) % model.tiles.length;
  before.owners.dock = 1;
  const { after, frames } = plan(model, before);
  assert.equal(after.lastMove.laps, 1);
  assert.equal(after.players[0].cash, before.players[0].cash);
  assert.deepEqual(
    frames
      .at(-1)
      .cashChanges.filter((change) => change.player === 0)
      .map((change) => change.amount),
    [10, -10],
  );
});

test("every supported board size and die ends at the saved position and funds", () => {
  for (const count of [4, 7, 12, 20]) {
    for (let sides = 2; sides <= 6; sides++) {
      for (let seed = 0; seed < 10; seed++) {
        const model = boardGame();
        model.tiles = Array.from({ length: count }, (_, i) => ({
          id: "tile-" + i,
          name: "地块 " + i,
          type: i === 0 ? "start" : "property",
          price: i === 0 ? 0 : 5,
          rent: i === 0 ? 0 : 3,
        }));
        model.rules.diceSides = sides;
        model.rules.salary = 7;
        const before = f.startBoard(model, seed);
        before.players[0].position = count - 1;
        const { after, frames } = plan(model, before);
        const path = frames.filter((frame) => frame.phase === "move");
        assert.equal(path.length, after.lastMove.die);
        assert.equal(
          path.at(-1).state.players[0].position,
          after.players[0].position,
        );
        assert.deepEqual(frames.at(-1).state.players, after.players);
        assert.ok(
          frames.every(
            (frame) =>
              frame.duration > 0 &&
              frame.state.players.every((p) => p.cash >= 0),
          ),
        );
      }
    }
  }
});
