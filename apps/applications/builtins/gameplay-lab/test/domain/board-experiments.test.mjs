import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import {
  boardPlan,
  completeBoardExperiment,
} from "../helpers/board-experiment.mjs";
const fresh = (compare = true, count = 4) =>
  f.newBoardExperiment("project-board", boardPlan(compare, count));
const immediate = async () => {};

test("board experiment plans freeze rules and reject ambiguous comparisons, overflow and unsupported sources", () => {
  const plan = boardPlan(),
    e = f.newBoardExperiment("project-board", plan);
  plan.variants[0].model.tiles[1].rent = 999;
  assert.equal(e.variants[0].model.tiles[1].rent, 30);
  assert.deepEqual(f.boardExperimentIssues(boardPlan()), []);
  for (const mutate of [
    (p) => (p.seedStart = 0xffffffff),
    (p) => (p.seedCount = 121),
    (p) => (p.seedCount = 1.5),
    (p) => (p.variants[1].source = structuredClone(p.variants[0].source)),
    (p) => (p.variants[1].model = structuredClone(p.variants[0].model)),
    (p) => (p.variants[0].source.kind = "preset"),
    (p) => (p.variants[0].model.rules.diceSides = 0),
  ]) {
    const bad = boardPlan();
    mutate(bad);
    assert.throws(() => f.newBoardExperiment("project-board", bad));
  }
  assert.equal(
    f.boardExperimentTotal(f.newBoardExperiment("p", boardPlan(false, 240))),
    240,
  );
  assert.deepEqual(
    f.boardExperimentIssues({ ...boardPlan(false, 1), seedStart: 0xffffffff }),
    [],
  );
});

test("board scheduler alternates frozen versions per seed, repairs holes, and never reruns an error cell", () => {
  let e = fresh();
  const expected = [
    [0, "baseline"],
    [0, "candidate"],
    [1, "baseline"],
    [1, "candidate"],
  ];
  for (const [index, variant] of expected) {
    const s = f.nextBoardSample(e);
    assert.equal(s.index, index);
    assert.equal(s.variant, variant);
    assert.equal(s.seed, 42 + index);
    e = f.appendBoardSample(e, s);
  }
  const removed = e.samples.splice(1, 1)[0];
  assert.deepEqual(f.nextBoardSample(e), removed);
  const state = f.startBoard(e.variants[1].model, 43);
  e.samples.push({
    variant: "candidate",
    index: 1,
    seed: 43,
    decisions: [],
    final: state,
    error: "test error",
  });
  // Replace the existing cell with the failed attempt, then fill the earlier hole.
  e.samples.splice(
    e.samples.findIndex((s) => s.index === 1 && s.variant === "candidate"),
    1,
  );
  e = f.appendBoardSample(e, removed);
  assert.equal(f.nextBoardSample(e).index, 2);
  assert.throws(() => f.appendBoardSample(e, removed), /已存在/);
});

test("100 paired seeds show lower rent lengthens this board without inventing limit winners", () => {
  const e = completeBoardExperiment(fresh(true, 100));
  const [a, b] = f.boardExperimentRows(e),
    paired = f.boardPairedComparison(e);
  assert.equal(e.samples.length, 200);
  assert.equal(e.status, "completed");
  assert.equal(a.finished, 100);
  assert.equal(b.finished, 100);
  assert.equal(paired.count, 100);
  assert.ok(b.averageTurns > a.averageTurns);
  assert.ok(b.limitRate > a.limitRate);
  assert.equal(b.limitRate, 100);
  assert.equal(a.averageTurns.toFixed(1), "3.7");
  assert.deepEqual(a.winRates, [61, 39]);
  assert.deepEqual(b.winRates, [0, 0]);
  assert.equal(a.bankruptRate + a.limitRate, 100);
  assert.equal(paired.averageTurnChange, b.averageTurns - a.averageTurns);
  assert.deepEqual(f.parseBoardExperiment(e, e.projectId), e);
});

test("board statistics exclude errors, retain limits in denominators and compare only matching successful seeds", () => {
  let e = fresh();
  for (let n = 0; n < 3; n++) e = f.appendBoardSample(e, f.nextBoardSample(e));
  e = f.appendBoardSample(e, {
    variant: "candidate",
    index: 1,
    seed: 43,
    decisions: [],
    final: f.startBoard(e.variants[1].model, 43),
    error: "interrupted sample",
  });
  const rows = f.boardExperimentRows(e),
    paired = f.boardPairedComparison(e);
  assert.equal(rows[0].finished, 2);
  assert.equal(rows[1].finished, 1);
  assert.equal(rows[1].errors, 1);
  assert.equal(rows[1].limitRate, 100);
  assert.equal(rows[1].averageTurns, 20);
  assert.equal(paired.count, 1);
  assert.equal(paired.averageTurnChange, 18);
  assert.deepEqual(f.parseBoardExperiment(e, e.projectId), e);
  const empty = f.boardExperimentRows(fresh(false))[0];
  assert.equal(empty.averageTurns, null);
  assert.deepEqual(empty.winRates, [0, 0]);
  assert.equal(f.boardPairedComparison(fresh(false)), null);
});

test("sample replays use frozen commands and rules through the ordinary strict board parser", () => {
  const e = completeBoardExperiment(fresh()),
    s = e.samples[0],
    r = f.boardSampleRecord(e, s);
  assert.deepEqual(f.parseBoardRecord(r, e.projectId), r);
  assert.equal(f.boardReplay(r, 1).phase, "purchase");
  assert.equal(f.boardReplay(r, r.decisions.length).outcome.winner, 0);
  r.model.tiles[1].rent = 999;
  assert.equal(e.variants[0].model.tiles[1].rent, 30);
});

test("board experiment parser rejects tampered seeds, commands, policy, model, status and cached samples", () => {
  const e = completeBoardExperiment(fresh()),
    parser = f.createBoardExperimentParser();
  assert.deepEqual(parser(e, e.projectId), e);
  for (const mutate of [
    (x) => x.samples[0].seed++,
    (x) => x.samples[0].index++,
    (x) => x.samples.push(structuredClone(x.samples[0])),
    (x) => (x.samples[0].decisions[1].type = "skip"),
    (x) => (x.samples[0].decisions[0].extra = undefined),
    (x) => x.samples[0].final.players[0].cash++,
    (x) => (x.variants[0].model.tiles[1].rent = 1),
    (x) => (x.policy.version = 2),
    (x) => (x.simulator.version = 2),
    (x) => (x.status = "running"),
    (x) => (x.samples[0].error = "not a terminal sample"),
  ]) {
    const bad = structuredClone(e);
    mutate(bad);
    assert.throws(() => parser(bad, e.projectId));
    assert.deepEqual(parser(e, e.projectId), e);
  }
  assert.throws(() => parser(e, "different-project"));
});

test("cancelling before the first sample persists a resumable empty plan", async () => {
  const e = fresh(),
    saved = [],
    published = [];
  const stopped = await f.runBoardExperimentBatch(e, {
    persist: async (x) => saved.push(x),
    changed: (x) => published.push(x),
    cancelled: () => true,
    yieldTask: immediate,
  });
  assert.equal(stopped.status, "cancelled");
  assert.equal(stopped.samples.length, 0);
  assert.deepEqual(saved, published);
  assert.equal(e.status, "running");
  assert.deepEqual(f.parseBoardExperiment(stopped, e.projectId), stopped);
});

test("cancellation during checkpoint writing saves that full sample and resume skips it", async () => {
  let cancelled = false;
  const saved = [],
    published = [];
  const e = fresh(),
    stopped = await f.runBoardExperimentBatch(e, {
      persist: async (x) => {
        saved.push(structuredClone(x));
        if (x.samples.length === 1) cancelled = true;
      },
      changed: (x) => published.push(x),
      cancelled: () => cancelled,
      yieldTask: immediate,
    });
  assert.equal(stopped.status, "cancelled");
  assert.equal(stopped.samples.length, 1);
  assert.deepEqual(
    saved.map((x) => x.status),
    ["running", "cancelled"],
  );
  assert.deepEqual(saved, published);
  const resumed = await f.runBoardExperimentBatch(
    { ...stopped, status: "running" },
    {
      persist: async () => {},
      changed: () => {},
      cancelled: () => false,
      yieldTask: immediate,
    },
  );
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.samples.length, 8);
  assert.deepEqual(resumed.samples[0], stopped.samples[0]);
  assert.equal(
    new Set(resumed.samples.map((s) => s.index + ":" + s.variant)).size,
    8,
  );
});

test("failed persistence never publishes unsaved progress; cancellation on the last sample retains completion", async () => {
  const e = fresh(false, 2),
    published = [];
  await assert.rejects(
    f.runBoardExperimentBatch(e, {
      persist: async (x) => {
        if (x.samples.length === 2) throw new Error("disk failed");
      },
      changed: (x) => published.push(x),
      cancelled: () => false,
      yieldTask: immediate,
    }),
    /disk failed/,
  );
  assert.equal(published.length, 1);
  assert.equal(published[0].samples.length, 1);
  assert.equal(e.samples.length, 0);
  let cancelled = false;
  const final = await f.runBoardExperimentBatch(
    { ...published[0], status: "running" },
    {
      persist: async () => {
        cancelled = true;
      },
      changed: () => {},
      cancelled: () => cancelled,
      yieldTask: immediate,
    },
  );
  assert.equal(final.status, "completed");
  assert.equal(final.samples.length, 2);
});
