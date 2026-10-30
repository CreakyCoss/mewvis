import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import { boardGame } from "../helpers/board-game.mjs";
const command = (type, player = 0) => ({ type, player });
const step = (m, s, type, player = s.actor) =>
  f.advanceBoard(m, s, command(type, player)).state;

test("board projects start without authored land and bind their own schema and runtime", () => {
  const m = f.createFrameworkModel("board-economy", "我的棋盘");
  assert.equal(m.format, "gameplay-board-economy-v1");
  assert.deepEqual(m.tiles, []);
  assert.deepEqual(f.validateDesign(m, true), []);
  assert.ok(f.validateDesign(m).length);
  assert.throws(() => f.startBoard(m));
  assert.equal(f.defaultFramework("board").id, "board-economy");
  assert.equal(
    f.frameworkForSimulator({ id: "board-economy", version: 1 }),
    "board-economy",
  );
  assert.equal(
    f.simulatorDefinition({ id: "board-economy", version: 1 }),
    undefined,
  );
  assert.deepEqual(f.projectContent(m), { items: [], references: [] });
});

test("board validation preserves incomplete drafts and rejects malformed or unsupported rules", () => {
  const m = boardGame();
  assert.deepEqual(f.validateBoard(m), []);
  for (const change of [
    (m) => (m.format = "gameplay-board-economy-v2"),
    (m) => (m.extensions = {}),
    (m) => (m.rules.extra = true),
    (m) => m.rules.players.pop(),
    (m) => (m.rules.initialCash = -1),
    (m) => (m.rules.salary = 1.2),
    (m) => (m.rules.diceSides = 7),
    (m) => (m.rules.maxTurns = 201),
    (m) => (m.tiles[1].id = m.tiles[0].id),
    (m) => (m.tiles[1].id = "__proto__"),
    (m) => (m.tiles[1].type = "tax"),
    (m) => (m.tiles[1].price = Infinity),
    (m) => (m.tiles[0].rent = 1),
  ]) {
    const bad = structuredClone(m);
    change(bad);
    assert.ok(f.validateBoard(bad, true).length);
    assert.throws(() => f.startBoard(bad));
  }
  for (const change of [
    (m) => (m.tiles[1].name = ""),
    (m) => (m.tiles[1].price = 0),
    (m) => (m.tiles[0].type = "rest"),
    (m) => m.tiles.pop(),
    (m) => (m.rules.players[1] = m.rules.players[0]),
  ]) {
    const draft = structuredClone(m);
    change(draft);
    assert.deepEqual(f.validateBoard(draft, true), []);
    assert.ok(f.validateBoard(draft).length);
  }
  for (const seed of [-1, 1.5, 0x100000000, NaN])
    assert.throws(() => f.startBoard(m, seed));
});

test("seeded rolling, purchase and bankruptcy complete a deterministic cash and ownership game", () => {
  const m = boardGame(),
    source = structuredClone(m),
    initial = f.startBoard(m, 42);
  const landed = step(m, initial, "roll");
  assert.deepEqual(landed, f.advanceBoard(m, initial, command("roll")).state);
  assert.deepEqual(landed.lastMove, {
    player: 0,
    from: 0,
    to: 1,
    die: 1,
    laps: 0,
  });
  assert.equal(landed.phase, "purchase");
  assert.equal(landed.pending, "dock");
  assert.equal(landed.turn, 1);
  const purchased = step(m, landed, "buy");
  assert.equal(purchased.owners.dock, 0);
  assert.equal(purchased.players[0].cash, 15);
  assert.equal(purchased.actor, 1);
  assert.equal(purchased.turn, 2);
  const ended = step(m, purchased, "roll");
  assert.equal(ended.phase, "finished");
  assert.equal(ended.outcome.kind, "won");
  assert.equal(ended.outcome.winner, 0);
  assert.equal(ended.players[0].cash, 35);
  assert.equal(ended.players[1].cash, 0);
  assert.equal(ended.players[1].bankrupt, true);
  assert.deepEqual(
    ended.events.map((e) => e.type),
    ["roll", "rent", "bankrupt"],
  );
  assert.deepEqual(initial, f.startBoard(m, 42));
  assert.deepEqual(m, source);
});

test("invalid actors, phases, extra command fields and purchases reject atomically", () => {
  const m = boardGame(),
    initial = f.startBoard(m),
    before = structuredClone(initial);
  for (const c of [
    command("roll", 1),
    command("buy"),
    command("skip"),
    command("unknown"),
    { ...command("roll"), die: 6 },
    null,
  ])
    assert.throws(() => f.advanceBoard(m, initial, c));
  assert.deepEqual(initial, before);
  const landed = step(m, initial, "roll"),
    snapshot = structuredClone(landed);
  assert.throws(() => step(m, landed, "roll"));
  assert.throws(() => step(m, landed, "buy", 1));
  const poor = structuredClone(landed);
  poor.players[0].cash = 0;
  assert.throws(() => step(m, poor, "buy"));
  assert.equal(poor.owners.dock, null);
  assert.deepEqual(landed, snapshot);
  const skipped = step(m, landed, "skip");
  assert.equal(skipped.owners.dock, null);
  assert.equal(skipped.players[0].cash, 20);
  const own = f.observeBoard(m, landed, 0),
    other = f.observeBoard(m, landed, 1);
  assert.deepEqual(f.boardCommands(m, other), []);
  assert.equal(f.boardCommands(m, own).length, 2);
  own.players[0].cash = 1000;
  assert.deepEqual(landed, snapshot);
});

test("passing start pays every crossed lap before rent and does not pay again on buying", () => {
  const m = boardGame();
  m.rules.diceSides = 6;
  m.rules.salary = 7;
  m.tiles[1].rent = 10;
  const s = f.startBoard(m, 1600);
  s.players[0].position = 3;
  s.players[0].cash = 5;
  s.owners.dock = 1;
  const next = step(m, s, "roll");
  assert.equal(next.lastMove.die, 6);
  assert.equal(next.lastMove.laps, 2);
  assert.equal(next.players[0].position, 1);
  assert.equal(next.players[0].cash, 9);
  assert.equal(next.players[1].cash, 30);
  assert.equal(next.outcome, null);
  assert.deepEqual(
    next.events.map((e) => e.type),
    ["roll", "salary", "rent"],
  );
  const start = boardGame();
  start.rules.salary = 7;
  const atStart = f.startBoard(start);
  atStart.players[0].position = 3;
  const arrived = step(start, atStart, "roll");
  assert.equal(arrived.players[0].position, 0);
  assert.equal(arrived.players[0].cash, 27);
  const forBuy = structuredClone(s);
  forBuy.owners.dock = null;
  const landed = step(m, forBuy, "roll"),
    bought = step(m, landed, "buy");
  assert.equal(
    bought.players[0].cash,
    landed.players[0].cash - m.tiles[1].price,
  );
  assert.equal(
    bought.events.some((e) => e.type === "salary"),
    false,
  );
});

test("own land and unaffordable empty land settle without rent; exact payment does not declare bankruptcy", () => {
  const m = boardGame(),
    s = f.startBoard(m);
  s.owners.dock = 0;
  const own = step(m, s, "roll");
  assert.equal(own.actor, 1);
  assert.equal(own.players[0].cash, 20);
  assert.equal(
    own.events.some((e) => e.type === "rent"),
    false,
  );
  const poor = f.startBoard(m);
  poor.players[0].cash = 1;
  const skipped = step(m, poor, "roll");
  assert.equal(skipped.phase, "roll");
  assert.equal(skipped.actor, 1);
  assert.equal(skipped.owners.dock, null);
  const exact = f.startBoard(m);
  exact.owners.dock = 1;
  exact.players[0].cash = 30;
  const paid = step(m, exact, "roll");
  assert.equal(paid.players[0].cash, 0);
  assert.equal(paid.players[0].bankrupt, false);
  assert.equal(paid.outcome, null);
});

test("bankruptcy transfers remaining cash and all debtor properties to the creditor", () => {
  const m = boardGame(),
    s = f.startBoard(m);
  s.actor = 1;
  s.players[1].cash = 10;
  s.owners.dock = 0;
  s.owners.market = 1;
  const before = structuredClone(s),
    next = step(m, s, "roll");
  assert.equal(next.outcome.winner, 0);
  assert.equal(next.players[0].cash, 30);
  assert.equal(next.players[1].cash, 0);
  assert.equal(next.owners.market, 0);
  assert.deepEqual(s, before);
  assert.deepEqual(f.boardCommands(m, f.observeBoard(m, next, 0)), []);
  assert.throws(() => step(m, next, "roll"));
});

test("turn limits settle pending purchases and preserve an explicit undecided result", () => {
  const m = boardGame();
  m.rules.maxTurns = 1;
  const landed = step(m, f.startBoard(m), "roll");
  assert.equal(landed.phase, "purchase");
  assert.equal(landed.outcome, null);
  const ended = step(m, landed, "skip");
  assert.equal(ended.phase, "finished");
  assert.equal(ended.outcome.kind, "limit");
  assert.equal(ended.outcome.winner, undefined);
  assert.equal(ended.turn, 1);
});

test("basic players use legal public decisions; complete games conserve cash changes and obey the work budget", () => {
  let wins = 0;
  for (let seed = 0; seed < 20; seed++) {
    const m = boardGame(),
      before = structuredClone(m);
    let state = f.startBoard(m, seed),
      steps = 0;
    while (!state.outcome) {
      const view = f.observeBoard(m, state, state.actor),
        c = f.chooseBoard(m, view);
      assert.ok(f.boardCommands(m, view).some((legal) => f.sameJson(legal, c)));
      const total = state.players.reduce((n, p) => n + p.cash, 0),
        next = f.advanceBoard(m, state, c).state;
      const delta = next.events.reduce(
        (n, e) =>
          n +
          (e.type === "salary" ? e.amount : e.type === "buy" ? -e.amount : 0),
        0,
      );
      assert.equal(next.players.reduce((n, p) => n + p.cash, 0) - total, delta);
      assert.ok(next.players.every((p) => p.cash >= 0));
      assert.ok(
        Object.values(next.owners).every(
          (o) => o === null || o === 0 || o === 1,
        ),
      );
      state = next;
      assert.ok(++steps <= m.rules.maxTurns * 2);
    }
    if (state.outcome.kind === "won") wins++;
    assert.deepEqual(m, before);
  }
  assert.ok(wins > 0);
  const m = boardGame();
  m.rules.salary = 20;
  const landed = step(m, f.startBoard(m), "roll");
  assert.equal(f.chooseBoard(m, f.observeBoard(m, landed, 0)).type, "skip");
});

test("board records freeze content, replay each command and reject tampered outcomes, seeds, rules and versions", () => {
  const m = boardGame();
  let r = f.newBoardRecord("project", m, 42);
  const empty = structuredClone(r);
  m.tiles[1].rent = 1;
  for (const type of ["roll", "buy", "roll"])
    r = f.advanceBoardRecord(r, command(type, r.final.actor), "basic");
  assert.equal(r.final.outcome.kind, "won");
  assert.equal(r.model.tiles[1].rent, 30);
  assert.deepEqual(f.parseBoardRecord(r, "project"), r);
  assert.deepEqual(f.boardReplay(r, 0), empty.final);
  assert.equal(f.boardReplay(r, 1).phase, "purchase");
  assert.equal(f.boardReplay(r, 2).owners.dock, 0);
  assert.deepEqual(f.boardReplay(r), r.final);
  assert.equal(f.boardTimeline(r).length, 4);
  for (const change of [
    (r) => r.final.players[0].cash++,
    (r) => (r.final.owners.dock = 1),
    (r) => (r.seed = 99),
    (r) => (r.model.tiles[1].price = 6),
    (r) => (r.simulator.version = 2),
    (r) => (r.decisions[0].player = 1),
    (r) => (r.decisions[0].die = 1),
    (r) => r.drivers.pop(),
    (r) => (r.drivers[0] = "unknown"),
    (r) => (r.format = "other"),
    (r) => (r.updatedAt = undefined),
  ]) {
    const bad = structuredClone(r);
    change(bad);
    assert.throws(() => f.parseBoardRecord(bad, "project"));
  }
  assert.throws(() => f.parseBoardRecord(r, "other-project"));
  assert.throws(() => f.boardReplay(r, -1));
  assert.throws(() => f.advanceBoardRecord(r, command("roll")));
});

test("maximum rule bounds terminate safely without silently capping money or inventing a winner", () => {
  const m = boardGame();
  Object.assign(m.rules, {
    initialCash: 1_000_000,
    salary: 1_000_000,
    diceSides: 6,
    maxTurns: 200,
  });
  m.tiles
    .filter((t) => t.type === "property")
    .forEach((t) => {
      t.price = 1;
      t.rent = 1;
    });
  let r = f.newBoardRecord("project", m, 1600);
  while (!r.final.outcome)
    r = f.advanceBoardRecord(
      r,
      f.chooseBoard(m, f.observeBoard(m, r.final, r.final.actor)),
      "basic",
    );
  assert.equal(r.final.outcome.kind, "limit");
  assert.ok(r.decisions.length <= 400);
  assert.ok(r.final.players.every((p) => p.cash <= 1_000_000_000));
  assert.deepEqual(f.parseBoardRecord(r, "project"), r);
});
